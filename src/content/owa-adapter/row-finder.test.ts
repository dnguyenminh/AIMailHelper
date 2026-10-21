// src/content/owa-adapter/row-finder.test.ts — uat62: 👁/↗ không còn "không có chuyện gì".
// findLiveRow: (1) native attribute probe; (2) rescan + so messageId (synthetic khớp).
// scroll-search: jsdom không có layout thật — kiểm tra nhánh "không thấy → null, không ném".
// SR-10: fixture dựng bằng DOM API (createElement/textContent) — không innerHTML kể cả trong test.
import { beforeEach, describe, expect, it } from "vitest";
import { findLiveRow, scrollSearchRow } from "./row-finder";
import type { LocateFn } from "./triage";

const PREVIEW = "Dear Anh Đức, nội dung preview của email thử nghiệm";

function makeRow(idAttr: string, subject: string, sender: string): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("role", "option");
  if (idAttr.length > 0) row.setAttribute("data-itemid", idAttr);
  row.setAttribute("aria-label", "From: " + sender + " unread");
  const heading = document.createElement("h2");
  heading.textContent = subject;
  const preview = document.createElement("span");
  preview.textContent = PREVIEW;
  row.appendChild(heading);
  row.appendChild(preview);
  return row;
}

function buildList(): HTMLElement {
  const box = document.createElement("div");
  box.setAttribute("role", "listbox");
  box.appendChild(makeRow("native-1", "Mail một", "a@x.vn"));
  box.appendChild(makeRow("", "Mail hai", "b@x.vn"));
  document.body.replaceChildren(box);
  return box;
}

const locate: LocateFn = async (key, _question) =>
  key === "inbox-list" ? document.querySelector('[role="listbox"]') : null;

beforeEach(() => {
  buildList();
});

describe("row-finder — 👁/↗ tìm row sống (uat62)", () => {
  it("native attribute probe: data-itemid → row đúng", async () => {
    const row = await findLiveRow("native-1", locate);
    expect(row).not.toBeNull();
    expect(row?.getAttribute("data-itemid")).toBe("native-1");
  });

  it("synthetic id: rescan DOM hiện tại + so messageId (không phụ thuộc element cũ)", async () => {
    // Lần quét 1 — lấy id synthetic của row "Mail hai" từ DOM gốc (readItem export uat62):
    const list = document.querySelector('[role="listbox"]') as Element;
    const row2 = list.querySelectorAll('[role="option"]')[1] as Element;
    const { readItem } = await import("./triage");
    const scanned = await readItem(row2);
    expect(scanned?.messageId).toBeTruthy();
    // OWA re-render: DOM thay THẾ hoàn toàn — element cũ không còn tham chiếu nào:
    buildList();
    const found = await findLiveRow(scanned?.messageId as string, locate);
    expect(found).not.toBeNull(); // tìm được row MỚI nhờ rescan + so messageId
    expect(found?.textContent).toContain("Mail hai");
  });

  it("scrollSearchRow: không thấy trong DOM + jsdom không có layout → null (không ném)", async () => {
    const row = await scrollSearchRow("synthetic:khongtontai", locate, 0);
    expect(row).toBeNull();
  });
});
