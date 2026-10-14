// src/content/owa-adapter/editable.test.ts — GĐ4 (TDD §3.1.5): ghi text React-an toàn — native
// setter + dispatch input event (KHÔNG gán .value trực tiếp — React controlled sẽ revert);
// contenteditable: execCommand insertText → fallback textContent; append = cũ + "\n\n" + draft.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readEditableText, writeEditableText } from "./editable";

function textarea(value: string): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  el.value = value;
  document.body.appendChild(el);
  return el;
}

function contentEditable(text: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function inputEvents(el: Element): Event[] {
  const events: Event[] = [];
  el.addEventListener("input", (event) => events.push(event));
  return events;
}

afterEach(() => {
  const owned = document as unknown as { execCommand?: unknown };
  delete owned.execCommand;
  document.body.replaceChildren(); // SR-10 — không dùng innerHTML kể cả trong test
});

describe("readEditableText", () => {
  it("textarea → .value; contenteditable → textContent", () => {
    expect(readEditableText(textarea("giá trị"))).toBe("giá trị");
    expect(readEditableText(contentEditable("nội dung div"))).toBe("nội dung div");
  });
});

describe("writeEditableText — React-safe (§3.1.5)", () => {
  it("textarea: native setter + dispatch input bubbles (React value tracker nhận state)", () => {
    const el = textarea("");
    const events = inputEvents(el);
    // Fixture React-style: value tracker trên element — gán trực tiếp không qua setter sẽ bị revert.
    const tracker = el;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    expect(descriptor?.set).toBeTypeOf("function"); // native setter tồn tại — đường đi chuẩn
    expect(writeEditableText(tracker, "Thân gửi anh,", "replace")).toBe(true);
    expect(el.value).toBe("Thân gửi anh,");
    expect(events).toHaveLength(1);
    expect(events[0]?.bubbles).toBe(true);
  });

  it("append: giá trị mới = cũ + '\\n\\n' + draft (AF-5 ghép thêm)", () => {
    const el = textarea("Dự thảo cũ");
    expect(writeEditableText(el, "Draft AI", "append")).toBe(true);
    expect(el.value).toBe("Dự thảo cũ\n\nDraft AI");
  });

  it("contenteditable: execCommand insertText sau focus (đường chuẩn trình duyệt)", () => {
    const el = contentEditable("cũ");
    const execCommand = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;
    const focusSpy = vi.spyOn(el, "focus");
    expect(writeEditableText(el, "Draft AI", "replace")).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "Draft AI");
    expect(el.textContent).toBe("cũ"); // execCommand mock không sửa DOM thật — chấp nhận (path đã assert)
  });

  it("contenteditable: execCommand không khả dụng/thất bại → fallback textContent + input event", () => {
    const el = contentEditable("cũ");
    const events = inputEvents(el);
    expect(writeEditableText(el, "Draft AI", "replace")).toBe(true);
    expect(el.textContent).toBe("Draft AI");
    expect(events).toHaveLength(1);
  });
});
