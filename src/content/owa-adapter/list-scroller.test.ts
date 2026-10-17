// src/content/owa-adapter/list-scroller.test.ts — UAT 18/10: anchor vùng cuộn do user cung cấp
// (#Skip to message list-region) + chuỗi tìm scroller (region BFS → ancestor-walk → fallback).
// jsdom không có layout — stub scrollHeight/clientHeight (defineProperty) + overflowY (spy).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findListScroller, liveMailList } from "./list-scroller";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

// Giả lập layout: scrollHeight/clientHeight cho delta; overflowY qua spy getComputedStyle.
function stubScroll(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
}

const stubOverflow = (value: string): void => {
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (() => ({ overflowY: value })) as unknown as typeof window.getComputedStyle
  );
};

function buildRegionLayout(): HTMLElement {
  const region = el("div", { id: "Skip to message list-region" });
  const scroller = el("div", { class: "list-scroller" });
  const listbox = el("div", { role: "listbox", "aria-label": "Message list" });
  for (let i = 0; i < 12; i += 1) listbox.appendChild(el("div", { role: "option", "data-itemid": `m${i}` }));
  scroller.appendChild(listbox);
  region.appendChild(scroller);
  document.body.appendChild(region);
  return scroller;
}

beforeEach(() => {
  document.body.textContent = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findListScroller — anchor #Skip to message list-region (user cung cấp 18/10)", () => {
  it("scroller nằm TRONG region (overflow auto, delta lớn) → trả scroller, không phải region", () => {
    const scroller = buildRegionLayout();
    stubScroll(scroller, 2000, 400); // delta 1600
    stubOverflow("auto");
    expect(findListScroller(scroller.parentElement as HTMLElement)).toBe(scroller);
  });

  it("scroller ẩn (overflow:hidden, delta>100) vẫn được nhận (cuộn được bằng code)", () => {
    const scroller = buildRegionLayout();
    stubScroll(scroller, 3000, 300); // delta 2700
    stubOverflow("hidden");
    expect(findListScroller(document.body)).toBe(scroller);
  });

  it("không có region + không ancestor cuộn được → null (caller fallback scrollIntoView)", () => {
    const list = el("div", { role: "listbox" });
    document.body.appendChild(list);
    stubOverflow("visible");
    expect(findListScroller(list)).toBeNull();
  });

  it("liveMailList: chọn container NHIỀU row nhất (mail list thắng list nhỏ trong reading pane)", () => {
    buildRegionLayout();
    const small = el("div", { role: "listbox", "aria-label": "Attachments" });
    small.appendChild(el("div", { role: "option" }, "file.png"));
    document.body.appendChild(small);
    const mail = liveMailList();
    expect(mail?.getAttribute("aria-label")).toBe("Message list");
  });
});
