// src/content/owa-adapter/editable.ts — đọc/ghi text React-an toàn cho compose box (TDD §3.1.5).
// KHÔNG dùng element.value = trực tiếp (React controlled component sẽ revert) — luôn qua native
// setter + dispatch input event; contenteditable: execCommand("insertText") + fallback textContent.
// Tách khỏi actions.ts: audit TC-121 chốt actions chỉ export {openReplyBox, insertDraft} (BR-01).
export type WriteMode = "replace" | "append";

const APPEND_SEPARATOR = "\n\n";

// SR-10 — đọc text: input/textarea qua .value; element khác (contenteditable) qua textContent.
export function readEditableText(el: Element): string {
  if (isFieldValue(el)) return el.value;
  return el.textContent ?? "";
}

// Ghi text theo mode (AF-5 UC-02: "replace" | "append"); append = nội dung cũ + draft.
// Trả true khi ghi được; false khi element không hỗ trợ bất kỳ đường ghi nào.
export function writeEditableText(el: Element, text: string, mode: WriteMode): boolean {
  const target = mode === "append" ? joinAppend(readEditableText(el), text) : text;
  if (isFieldValue(el)) {
    setFieldValue(el, target);
    return true;
  }
  return writeContentEditable(el, target);
}

function joinAppend(existing: string, text: string): string {
  const base = existing.trim();
  return (base.length > 0 ? base + APPEND_SEPARATOR : "") + text;
}

function isFieldValue(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

// Native setter của prototype (React giữ value tracker trên descriptor) + event input bubbles —
// OWA/React nhận state qua listener; KHÔNG dùng gán trực tiếp (bị React revert — §3.1.5).
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value; // descriptor lạ (non-standard env) — fallback gán, vẫn dispatch event
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// contenteditable: focus → execCommand insertText (React-safe chuẩn trình duyệt); execCommand
// không khả dụng/thất bại (jsdom, CSP edge) → fallback textContent + dispatch input event.
function writeContentEditable(el: Element, text: string): boolean {
  const holder = el as HTMLElement;
  holder.focus();
  if (replaceViaExecCommand(holder, text)) return true;
  holder.textContent = text;
  holder.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function replaceViaExecCommand(holder: HTMLElement, text: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  selectAll(holder);
  try {
    return document.execCommand("insertText", false, text);
  } catch {
    return false; // engine chặn execCommand — fallback textContent đã chờ ở caller
  }
}

function selectAll(holder: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection.removeAllRanges();
  selection.addRange(range);
}
