// src/content/owa-adapter/locator-expectations.ts — SR-08 (DEV-SECURITY-CHECKLIST GĐ3): sanity check
// role/aria-label theo expectation map per FunctionKey SAU khi deref (T2). Verify fail → tier thất
// bại, KHÔNG dispatch action lên element chưa verify. Map đủ 6 FunctionKey (§3.1.1).
import type { FunctionKey } from "./selectors";

export interface ElementExpectation {
  roles: readonly string[];
  labelPattern?: RegExp; // aria-label phải khớp (nếu khai báo)
}

export const LOCATOR_EXPECTATIONS: Record<FunctionKey, ElementExpectation> = {
  "reading-pane": { roles: ["main", "document", "article"] },
  "message-toolbar": { roles: ["toolbar"] },
  "reply-button": { roles: ["button"], labelPattern: /reply|trả lời/i },
  "compose-box": { roles: ["textbox"] },
  "inbox-list": { roles: ["list"] },
  "inbox-item": { roles: ["listitem", "row", "option"] }
};

// Implicit ARIA role tối thiểu cho tag phổ biến (OWA hay để implicit thay vì role attr).
function implicitRole(el: Element): string | null {
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

function roleOf(el: Element): string | null {
  return el.getAttribute("role") ?? implicitRole(el);
}

function labelOf(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (label.length > 0) return label;
  }
  return el.getAttribute("aria-label") ?? "";
}

// true khi element khớp expectation của functionKey (role + labelPattern nếu có).
export function verifyElement(functionKey: FunctionKey, el: Element | null): boolean {
  if (!el) return false;
  const expectation = LOCATOR_EXPECTATIONS[functionKey];
  const role = roleOf(el);
  if (role === null || !expectation.roles.includes(role)) return false;
  if (expectation.labelPattern && !expectation.labelPattern.test(labelOf(el))) return false;
  return true;
}
