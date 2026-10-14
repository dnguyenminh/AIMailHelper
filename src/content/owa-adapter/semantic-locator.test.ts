// src/content/owa-adapter/semantic-locator.test.ts — T2 orchestration (§5.3, FSD 6.6b):
// T1 hit → KHÔNG chạm cache/LLM; T1 fail → cache miss → LOCATOR_RESOLVE (mock refId) → deref +
// verify (SR-08) → ghi cache strategy="selector"; cache hit → 0 LLM call; hash đổi → vô hiệu;
// refId hallucinate (SR-01) / verify fail (SR-08) → tier thất bại trả null; derive fail → không cache.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../../../tests/mocks/chrome";
import { createA11yIndex } from "./a11y-tree";
import { computeLayoutHash } from "./layout-hash";
import { getLocator, removeLocator, setLocator } from "./locator-cache";
import { deriveStructuralSelector, SemanticLocator } from "./semantic-locator";
import type { LocatorResolveRequest, ResolveRpc, SemanticDeps } from "./semantic-locator";
import type { LocatorStrategy } from "./owa-adapter";
import { SelectorTier } from "./owa-adapter";

type Chrome = { chrome: ReturnType<typeof createChromeMock> };

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

// Fixture: nút Reply CÓ aria-label (snapshot thấy) nhưng KHÔNG khớp chain T1 (role=main thiếu).
function buildFixture(): HTMLElement {
  document.body.textContent = "";
  const reply = el("button", { "aria-label": "Reply" }, "Reply");
  const wrapper = el("div", {});
  wrapper.appendChild(reply);
  document.body.appendChild(wrapper);
  return reply;
}

function makeDeps(overrides: Partial<SemanticDeps> = {}): SemanticDeps {
  return {
    t1: failingT1, // mặc định T1 FAIL — test T2 flow; test T1-hit inject SelectorTier riêng
    index: createA11yIndex(),
    hash: () => computeLayoutHash(),
    resolveRpc: async () => ({ refId: null }),
    get: getLocator,
    set: setLocator,
    remove: removeLocator,
    evictStale: async () => undefined,
    ...overrides
  };
}

// T1 tier luôn fail — buộc luồng đi cache → T2 (BR-12 test isolation).
const failingT1: LocatorStrategy = { resolve: async () => null };

// mock RPC trích refId của nút "Reply" trong snapshot (mô phỏng SW gọi LLM trả refId).
const rpcReplyRef: ResolveRpc = async (request) => {
  const refMatch = /button "Reply" \((ref_\d+)\)/.exec(request.snapshot);
  return { refId: refMatch?.[1] ?? null };
};

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  document.body.textContent = "";
});

describe("SemanticLocator — chuỗi T1 → cache → T2 (BR-06/BR-12, §5.3)", () => {
  it("T1 hit → trả NGAY, không chạm cache/LLM (BR-12)", async () => {
    document.body.textContent = "";
    const main = el("div", { role: "main" }, "");
    main.appendChild(el("div", { "aria-label": "Message body" }));
    main.appendChild(el("button", { "aria-label": "Reply" }, "Reply"));
    document.body.appendChild(main);
    const resolveRpc = vi.fn();
    const locator = new SemanticLocator(makeDeps({ t1: new SelectorTier(), resolveRpc: resolveRpc as unknown as ResolveRpc }));
    const element = await locator.resolve("reply-button", "nút trả lời");
    expect(element?.getAttribute("aria-label")).toBe("Reply");
    expect(resolveRpc).not.toHaveBeenCalled();
    expect(await getLocator("reply-button", await computeLayoutHash())).toBeNull(); // không chạm cache
  });

  it("T1 fail → T2: snapshot → refId → deref → verify (SR-08) → ghi cache selector (#8)", async () => {
    const reply = buildFixture();
    const requests: LocatorResolveRequest[] = [];
    const resolveRpc: ResolveRpc = async (request) => {
      requests.push(request);
      return rpcReplyRef(request);
    };
    const locator = new SemanticLocator(makeDeps({ resolveRpc }));
    const element = await locator.resolve("reply-button", "nút trả lời (compose)");
    expect(element).toBe(reply);
    const captured = requests[0];
    expect(captured?.functionKey).toBe("reply-button");
    expect(captured?.snapshot).toContain('button "Reply"'); // snapshot có label chức năng
    expect(captured?.snapshot).not.toContain("Ignore"); // SR-02 — snapshot không chứa nội dung email
    const hash = await computeLayoutHash();
    const entry = await getLocator("reply-button", hash);
    expect(entry?.strategy).toBe("selector"); // #8 — persist CHỈ selector
    expect(entry?.value).toContain("aria-label");
    expect(document.querySelector(entry?.value ?? "")) .toBe(reply); // selector bền vững
  });

  it("cache hit (hash khớp) → 0 LLM call (BR-06 — lần sau 0 token)", async () => {
    buildFixture();
    const resolveRpc = vi.fn(rpcReplyRef);
    const locator = new SemanticLocator(makeDeps({ resolveRpc }));
    await locator.resolve("reply-button", "nút trả lời");
    expect(resolveRpc).toHaveBeenCalledTimes(1);
    const second = await locator.resolve("reply-button", "nút trả lời"); // T1 vẫn fail → vào cache
    expect(second).not.toBeNull();
    expect(resolveRpc).toHaveBeenCalledTimes(1); // lần 2 — cache hit, 0 token
  });

  it("hash đổi (cấu trúc đổi) → cache vô hiệu → gọi LLM lại (BR-06)", async () => {
    buildFixture();
    const resolveRpc = vi.fn(rpcReplyRef);
    const locator = new SemanticLocator(makeDeps({ resolveRpc }));
    await locator.resolve("reply-button", "nút trả lời");
    // MS đổi UI: thêm toolbar → hash đổi → entry cũ vô hiệu
    document.body.appendChild(el("div", { role: "toolbar" }));
    await locator.resolve("reply-button", "nút trả lời");
    expect(resolveRpc).toHaveBeenCalledTimes(2);
  });

  it("SR-01: refId hallucinate (không có trong element map) → tier thất bại, KHÔNG dispatch", async () => {
    buildFixture();
    const resolveRpc: ResolveRpc = vi.fn(async () => ({ refId: "ref_999" }));
    const locator = new SemanticLocator(makeDeps({ resolveRpc }));
    expect(await locator.resolve("reply-button", "nút trả lời")).toBeNull();
    expect(await getLocator("reply-button", await computeLayoutHash())).toBeNull(); // không cache element lạ
  });

  it("SR-08: element sai role/label expectation (compose-box nhận button) → tier thất bại", async () => {
    buildFixture();
    const resolveRpc = vi.fn(rpcReplyRef);
    const locator = new SemanticLocator(makeDeps({ resolveRpc }));
    expect(await locator.resolve("compose-box", "ô soạn thảo")).toBeNull(); // button ≠ textbox
  });

  it("LLM trả null → T2 fail (T3 GĐ4); ERR từ RPC → propagate đúng lỗi (không nuốt)", async () => {
    buildFixture();
    const nullLocator = new SemanticLocator(makeDeps({ resolveRpc: async () => ({ refId: null }) }));
    expect(await nullLocator.resolve("reply-button", "nút")).toBeNull();

    const AppErrorLike = class extends Error {
      code = "ERR-02";
      i18nKey = "errors.invalidKey";
    };
    const errLocator = new SemanticLocator(makeDeps({ resolveRpc: async () => { throw new AppErrorLike("401"); } }));
    await expect(errLocator.resolve("reply-button", "nút")).rejects.toMatchObject({ code: "ERR-02" });
  });

  it("t1 injectable: chain tier khác chạy đúng (Strategy seam §4.3)", async () => {
    const target = buildFixture();
    const customT1: LocatorStrategy = { resolve: async () => target };
    const locator = new SemanticLocator(makeDeps({ t1: customT1 }));
    expect(await locator.resolve("reply-button", "")).toBe(target);
  });
});

describe("deriveStructuralSelector — Open Issue #8 (không suy được → không cache)", () => {
  it("selector duy nhất → path tag+role+aria-label; querySelector trả đúng element", () => {
    document.body.textContent = "";
    const reply = el("button", { "aria-label": "Reply" });
    document.body.appendChild(reply);
    const selector = deriveStructuralSelector(reply);
    expect(selector).not.toBeNull();
    expect(document.querySelector(selector as string)).toBe(reply);
  });

  it("element path không unique (anh em cùng tag) → không suy được → null (không cache rác)", () => {
    document.body.textContent = "";
    document.body.append(el("div", {}), el("div", {}));
    const first = document.querySelectorAll("body > div")[0] as Element;
    const second = document.querySelectorAll("body > div")[1] as Element;
    // phần tử đầu: path từ root unique → suy được selector (path là định danh hợp lệ)
    expect(deriveStructuralSelector(first)).not.toBeNull();
    // phần tử thứ hai: path trả về phần tử ĐẦU → không unique → null (KHÔNG cache)
    expect(deriveStructuralSelector(second)).toBeNull();
  });
});
