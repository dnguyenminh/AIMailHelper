// src/content/owa-adapter/a11y-tree.ts — Tầng 2 walker (TDD §3.1.2; FSD 6.6a ĐÃ SỬA theo SR-02/M-2).
// SR-02 chốt (amendment v1.1 — overrides pseudocode 6.6a):
//  - Điều kiện phát element là AND: INTERACTIVE_ROLES.has(role) && hasMeaningfulLabel(label).
//  - KHÔNG fallback "text rút gọn 80 ký tự" — node không label thật → chỉ role + refId.
//  - role=listitem/paragraph/document (nội dung email) KHÔNG BAO GIỜ xuất text từ textContent.
//  → snapshot KHÔNG chứa body/subject/sender email (PII §8.4 — chỉ role + label chức năng).
// Ref ID qua WeakRef map (GLOSSARY): refByElement WeakMap + elementsByRef Map — không chặn GC.
export const MAX_SNAPSHOT_CHARS = 20_000; // Open Issue #4 chốt (§3.1.2)
export const MAX_DEPTH = 18;
export const MAX_LABEL_CHARS = 100;

export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "listbox", "option",
  "checkbox", "radio", "switch", "slider", "tab", "menuitem", "menu", "treeitem",
  "listitem" // thêm listitem phục vụ triage (GĐ5)
]);

// Node nội dung email — textContent KHÔNG BAO GIỜ được dùng làm label (SR-02).
const NO_TEXT_ROLES: ReadonlySet<string> = new Set(["listitem", "paragraph", "document"]);

export interface A11ySnapshot {
  text: string;
  truncated: boolean;
}

// «factory» A11ySource (Open Issue #7 seam — TDD §4.2): MVP Dom; sau MVP CdpA11ySource cùng interface.
export interface A11yIndex {
  buildSnapshot(root?: Element): A11ySnapshot;
  resolve(refId: string): Element | null;
}

// Ref registry theo pseudocode 6.6a — WeakMap/WeakRef KHÔNG giữ reference cứng, không chặn GC.
const refByElement = new WeakMap<Element, string>();
const elementsByRef = new Map<string, WeakRef<Element>>();

function resolveRef(el: Element, counter: { n: number }): string {
  let ref = refByElement.get(el);
  if (!ref) {
    ref = "ref_" + String(++counter.n); // ref_1, ref_12, ... ổn định trong 1 lần walk
    refByElement.set(el, ref);
    elementsByRef.set(ref, new WeakRef(el));
  }
  return ref;
}

export function createA11yIndex(): A11yIndex {
  return {
    buildSnapshot(root: Element = document.body): A11ySnapshot {
      const counter = { n: 0 };
      const state: WalkState = { lines: [], truncated: false };
      walk(root, 0, counter, state);
      return { text: state.lines.join("\n"), truncated: state.truncated };
    },
    resolve(refId: string): Element | null {
      return elementsByRef.get(refId)?.deref() ?? null; // refId lạ → null (SR-01 L3)
    }
  };
}

interface WalkState {
  lines: string[];
  truncated: boolean;
}

function walk(node: Element, depth: number, counter: { n: number }, state: WalkState): void {
  if (state.truncated || depth > MAX_DEPTH) return;
  if (isHidden(node)) return;
  const role = a11yRoleOf(node);
  if (role !== null && INTERACTIVE_ROLES.has(role)) {
    // SR-02 — AND: interactive + label chức năng thật; không label → chỉ role + refId.
    const label = a11yLabelOf(node, role);
    const labeled = hasMeaningfulLabel(label);
    emit(node, depth, role, labeled ? label : null, counter, state);
    if (state.truncated) return;
  }
  for (const child of node.children) walk(child, depth + 1, counter, state);
  if (node.shadowRoot) {
    for (const child of node.shadowRoot.children) walk(child as Element, depth + 1, counter, state);
  }
}

function emit(node: Element, depth: number, role: string, label: string | null, counter: { n: number }, state: WalkState): void {
  const ref = resolveRef(node, counter);
  const indent = "  ".repeat(Math.min(depth, 12));
  const line = label !== null
    ? indent + role + ' "' + label + '" (' + ref + ")"
    : indent + role + " (" + ref + ")";
  state.lines.push(line);
  if (totalChars(state.lines) > MAX_SNAPSHOT_CHARS) {
    state.lines.pop(); // cắt an toàn, đánh dấu truncated (§3.1.2 #4)
    state.truncated = true;
  }
}

function totalChars(lines: string[]): number {
  return lines.reduce((sum, line) => sum + line.length + 1, 0);
}

function isHidden(node: Element): boolean {
  if (node.getAttribute("aria-hidden") === "true") return true;
  const style = node.getAttribute("style") ?? "";
  return /display\s*:\s*none|visibility\s*:\s*hidden/.test(style);
}

// role attr → implicit fallback (button/textarea/a/select/main/article/input).
export function a11yRoleOf(el: Element): string | null {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "main") return "main";
  if (tag === "article") return "article";
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "search") return "searchbox";
    return "textbox";
  }
  return null;
}

// Label CHỈ từ aria-label/aria-labelledby (label chức năng thật — SR-02). Node thuộc NO_TEXT_ROLES
// hoặc bất kỳ node nào: KHÔNG dùng textContent làm label — đã bỏ fallback text-80 (M-2 bắt buộc).
export function a11yLabelOf(el: Element, role: string): string {
  if (NO_TEXT_ROLES.has(role)) return el.getAttribute("aria-label") ?? "";
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (label.length > 0) return truncateLabel(label);
  }
  return truncateLabel(el.getAttribute("aria-label") ?? "");
}

export function hasMeaningfulLabel(label: string): boolean {
  return label.trim().length > 0;
}

function truncateLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > MAX_LABEL_CHARS ? trimmed.slice(0, MAX_LABEL_CHARS) : trimmed;
}
