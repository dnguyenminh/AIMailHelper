// src/content/owa-adapter/locator-expectations.test.ts — SR-08: expectation map đủ 6 FunctionKey;
// verifyElement: đúng role/label → true; sai role / sai label → false (tier thất bại, không dispatch).
import { describe, expect, it } from "vitest";
import { LOCATOR_EXPECTATIONS, verifyElement } from "./locator-expectations";
import type { FunctionKey } from "./owa-adapter";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

describe("locator-expectations — SR-08 (sanity check sau deref)", () => {
  it("map đủ 6 FunctionKey (§3.1.1)", () => {
    const keys: FunctionKey[] = ["reading-pane", "message-toolbar", "reply-button", "compose-box", "inbox-list", "inbox-item"];
    for (const key of keys) expect(LOCATOR_EXPECTATIONS[key]).toBeDefined();
  });

  it("reply-button: button + label /reply|trả lời/i → true; sai role → false; sai label → false", () => {
    expect(verifyElement("reply-button", el("button", { "aria-label": "Reply" }))).toBe(true);
    expect(verifyElement("reply-button", el("button", { "aria-label": "Trả lời tất cả" }))).toBe(true);
    expect(verifyElement("reply-button", el("div", { role: "button", "aria-label": "Reply" }))).toBe(true);
    expect(verifyElement("reply-button", el("a", { "aria-label": "Reply" }))).toBe(false); // role link ≠ button
    expect(verifyElement("reply-button", el("button", { "aria-label": "Forward" }))).toBe(false);
    expect(verifyElement("reply-button", el("button", {}))).toBe(false); // không label
    expect(verifyElement("reply-button", null)).toBe(false);
  });

  it("compose-box: textbox (textarea implicit) → true; main → false", () => {
    expect(verifyElement("compose-box", el("textarea", { "aria-multiline": "true" }))).toBe(true);
    expect(verifyElement("compose-box", el("div", { role: "textbox" }))).toBe(true);
    expect(verifyElement("compose-box", el("main", {}))).toBe(false);
  });

  it("reading-pane: main|document|article; message-body div không role → false (T2 reading-pane chỉ nhận landmark)", () => {
    expect(verifyElement("reading-pane", el("main", {}))).toBe(true);
    expect(verifyElement("reading-pane", el("article", {}))).toBe(true);
    expect(verifyElement("reading-pane", el("div", { "aria-label": "Message body" }))).toBe(false);
  });

  it("message-toolbar/inbox-list/inbox-item: đúng role", () => {
    expect(verifyElement("message-toolbar", el("div", { role: "toolbar" }))).toBe(true);
    expect(verifyElement("inbox-list", el("div", { role: "list" }))).toBe(true);
    expect(verifyElement("inbox-item", el("div", { role: "listitem" }))).toBe(true);
    expect(verifyElement("inbox-item", el("div", { role: "row" }))).toBe(true);
    expect(verifyElement("inbox-list", el("div", { role: "listitem" }))).toBe(false);
  });
});
