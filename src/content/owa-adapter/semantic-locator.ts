// src/content/owa-adapter/semantic-locator.ts — T2 orchestration (TDD §3.1.2 + §5.3; FSD 6.6b).
// Chuỗi chuẩn: T1 fail → đọc cache (chỉ khi layoutHash khớp — BR-06) → build snapshot →
// LOCATOR_RESOLVE qua SW → deref WeakRef → verify expectations (SR-08) → chuyển refId thành
// structural selector khi GHI cache (Open Issue #8 — chỉ persist strategy="selector").
// SR-01 L3: refId lạ (không có trong element map) → tier thất bại, KHÔNG dispatch. KHÔNG eval.
import { sendMessage } from "../../shared/messaging";
import type { LocatorCacheEntry } from "../../shared/types";
import { createA11yIndex } from "./a11y-tree";
import type { A11yIndex } from "./a11y-tree";
import { computeLayoutHash } from "./layout-hash";
import { evictStaleHashes, getLocator, setLocator, removeLocator } from "./locator-cache";
import { verifyElement } from "./locator-expectations";
import type { FunctionKey, LocatorStrategy } from "./selectors";
import { SelectorTier } from "./selectors";

export interface LocatorResolveRequest {
  functionKey: string;
  question: string;
  snapshot: string;
}

export interface LocatorResolveResponse {
  refId: string | null;
}

export type ResolveRpc = (request: LocatorResolveRequest) => Promise<LocatorResolveResponse>;

export interface SemanticDeps {
  t1: LocatorStrategy;
  index: A11yIndex;
  hash: () => Promise<string>;
  resolveRpc: ResolveRpc;
  get: (functionKey: string, hash: string) => Promise<LocatorCacheEntry | null>;
  set: (functionKey: string, selector: string, hash: string) => Promise<void>;
  remove: (functionKey: string) => Promise<void>;
  evictStale: (hash: string) => Promise<void>;
}
const defaultRpc: ResolveRpc = (request) =>
  sendMessage<LocatorResolveResponse>("LOCATOR_RESOLVE", request);

// Default deps — test inject mọi seam (Strategy + DI, §4.3).
export function defaultDeps(): SemanticDeps {
  return {
    t1: new SelectorTier(),
    index: createA11yIndex(),
    hash: () => computeLayoutHash(),
    resolveRpc: defaultRpc,
    get: getLocator,
    set: setLocator,
    remove: removeLocator,
    evictStale: async (hash) => {
      await evictStaleHashes(hash);
    }
  };
}

export class SemanticLocator implements LocatorStrategy {
  private readonly deps: SemanticDeps;

  constructor(deps: SemanticDeps = defaultDeps()) {
    this.deps = deps;
  }

  // BR-12: T2 chỉ chạy khi T1 fail; T1 hit → trả NGAY, không chạm cache (§5.3 bước 2-3).
  async resolve(functionKey: FunctionKey, question: string): Promise<Element | null> {
    const t1Element = await this.deps.t1.resolve(functionKey, question);
    if (t1Element) {
      logTier("T1", functionKey);
      return t1Element;
    }
    const hash = await this.deps.hash();
    const cached = await this.fromCache(functionKey, hash);
    if (cached) return cached;
    return this.resolveViaLlm(functionKey, question, hash);
  }

  // §5.3 bước 4-6: cache hit (hash khớp) → querySelector → verify — 0 token (BR-06).
  private async fromCache(functionKey: FunctionKey, hash: string): Promise<Element | null> {
    const entry = await this.deps.get(functionKey, hash);
    if (!entry) return null;
    let element: Element | null = null;
    try {
      element = document.querySelector(entry.value);
    } catch {
      element = null; // selector hỏng (data ngoài) — bỏ entry
    }
    if (element && verifyElement(functionKey, element)) {
      logTier("cache", functionKey);
      return element;
    }
    await this.deps.remove(functionKey); // entry stale dù hash trùng → bỏ (6.6b)
    return null;
  }

  // §5.3 bước 7-13: snapshot → LOCATOR_RESOLVE → deref → verify (SR-08) → ghi cache selector (#8).
  private async resolveViaLlm(functionKey: FunctionKey, question: string, hash: string): Promise<Element | null> {
    const snapshot = this.deps.index.buildSnapshot();
    let refId: string | null = null;
    try {
      const response = await this.deps.resolveRpc({ functionKey: functionKey, question: question, snapshot: snapshot.text });
      refId = response.refId;
    } catch (error) {
      console.warn("[AIMH][locator] LOCATOR_RESOLVE failed:", error instanceof Error ? error.message : error); // KHÔNG log snapshot (BR-08)
      throw error; // LLM lỗi thật (ERR-02/03…) — caller thấy đúng lỗi, không nuốt (§9.1)
    }
    if (!refId) return null; // LLM không tìm thấy → T3 (GĐ4) nếu opt-in, không thì ERR-06 (caller)
    const element = this.deps.index.resolve(refId);
    if (!element) {
      console.info("[AIMH][locator] refId lạ/không còn sống — tier T2 thất bại (SR-01)"); // KHÔNG dispatch
      return null;
    }
    if (!verifyElement(functionKey, element)) {
      console.info("[AIMH][locator] element sai role/label expectation — tier T2 thất bại (SR-08)");
      return null;
    }
    await this.cache(functionKey, element, hash); // selector suy được mới cache — không cache rác (#8)
    return element;
  }

  // Open Issue #8: persist CHỈ structural selector; không suy được → KHÔNG cache; xóa hash cũ sau thành công.
  private async cache(functionKey: FunctionKey, element: Element, hash: string): Promise<void> {
    const selector = deriveStructuralSelector(element);
    if (selector === null) return;
    await this.deps.set(functionKey, selector, hash);
    await this.deps.evictStale(hash); // chỉ giữ entry của hash hiện tại (BR-06)
  }
}

// Path tag+role+aria-label từ ancestor → el; chỉ nhận khi querySelector trả đúng el (unique).
export function deriveStructuralSelector(el: Element, root: ParentNode = document): string | null {
  const segments = [selectorSegment(el)];
  let node: Element | null = el;
  for (let level = 0; level < 4 && node.parentElement; level += 1) {
    node = node.parentElement;
    segments.unshift(selectorSegment(node));
    const candidate = segments.join(" ");
    if (matchesUnique(candidate, el, root)) return candidate;
  }
  return matchesUnique(selectorSegment(el), el, root) ? selectorSegment(el) : null;
}

function matchesUnique(selector: string, expected: Element, root: ParentNode): boolean {
  try {
    return root.querySelector(selector) === expected;
  } catch {
    return false; // selector không hợp lệ (label chứa ký tự lạ chưa escape) → không cache
  }
}

function selectorSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  const label = el.getAttribute("aria-label");
  let segment = tag;
  if (role) segment += '[role="' + escapeAttr(role) + '"]';
  if (label) segment += '[aria-label="' + escapeAttr(label) + '"]';
  return segment;
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// §8.9 — Locator tier fallback: log info {functionKey, tier, kết quả} (session console).
function logTier(tier: string, functionKey: string): void {
  console.info("[AIMH][locator] tier=" + tier + " key=" + functionKey);
}
