// src/content/owa-adapter/triage-owa-new.test.ts — Regression UAT 17/10 (outlook.cloud.microsoft):
// reading pane chứa listbox ĐÍNH KÈM file render TRƯỚC inbox list theo DOM order (CSS grid đảo
// vị trí hiển thị) → T1 "inbox-list" bắt nhầm container đính kèm — console thật: "0 unread / 1
// items", item "Screenshot 2026-10-16 161300.png Open 16 KB". locateInboxList phải chọn
// container theo ownership-count (inbox nhiều item hơn luôn thắng attachment strip).
import { beforeEach, describe, expect, it } from "vitest";
import { locateInboxList } from "./inbox-list-locator";
import { collectInboxItems, collectUnreadItems } from "./triage";
import type { LocateFn } from "./triage";
import { resolveBySelectors } from "./selectors";

// T1 thật của extension (SelectorTier dùng cùng resolveBySelectors) — tái hiện hit SAI như UAT.
const locate: LocateFn = async (key) => resolveBySelectors(key);

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

// DOM mô phỏng OWA mới: reading pane (attachment listbox) TRƯỚC inbox list theo DOM order.
// Trả về element inbox list để test so sánh identity với container locateInboxList chọn.
function buildOwaNewLayout(): Element {
  const main = el("div", { role: "main" });
  const pane = el("div", { id: "Skip to message-region" });
  pane.appendChild(el("h1", { role: "heading" }, "Hợp đồng đang mở"));
  const attachments = el("div", { role: "listbox", "aria-label": "Attachments" });
  attachments.appendChild(el("div", { role: "option", "aria-label": "Screenshot 2026-10-16 161300.png Open 16 KB" }, "Screenshot"));
  pane.appendChild(attachments);
  const inbox = el("div", { role: "listbox", "aria-label": "Message list" });
  inbox.appendChild(buildMailRow("mail-1", "Báo giá tháng 10", "Unread message from An"));
  inbox.appendChild(buildMailRow("mail-2", "Nhắc hạn chót"));
  main.appendChild(pane);
  main.appendChild(inbox);
  document.body.appendChild(main);
  return inbox;
}

function buildMailRow(id: string, subject: string, unreadLabel?: string): HTMLElement {
  const row = el("div", { role: "option", "data-itemid": id });
  if (unreadLabel !== undefined) row.setAttribute("aria-label", unreadLabel);
  row.appendChild(el("h2", { role: "heading" }, subject));
  row.appendChild(el("span", { "aria-label": "From: a@x.vn" }, ""));
  return row;
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("locateInboxList — regression UAT 17/10 (attachment listbox đứng trước inbox list)", () => {
  it("T1 hit container đính kèm, nhưng locateInboxList chọn inbox list (nhiều item hơn)", async () => {
    const inbox = buildOwaNewLayout();
    const attachments = document.querySelector('[aria-label="Attachments"]');
    expect(await locate("inbox-list", "")).toBe(attachments); // tái hiện bug UAT thật
    expect(await locateInboxList(locate)).toBe(inbox); // fix: container đúng theo item count
  });

  it("collectInboxItems quét email từ inbox list — KHÔNG quét item đính kèm", async () => {
    buildOwaNewLayout();
    const items = await collectInboxItems(locate);
    expect(items.map((item) => item.messageId)).toEqual(["mail-1", "mail-2"]);
    expect(items.some((item) => item.subject.includes("Screenshot"))).toBe(false);
  });

  it("collectUnreadItems chỉ trả mail chưa đọc trong inbox list (mail-1)", async () => {
    buildOwaNewLayout();
    const items = await collectUnreadItems(locate);
    expect(items.map((item) => item.messageId)).toEqual(["mail-1"]);
  });

  it("inbox list KHÔNG trong [role=main] (layout khác) vẫn được tìm thấy — quét toàn document", async () => {
    const inbox = el("div", { role: "listbox", "aria-label": "Message list" });
    inbox.appendChild(buildMailRow("mail-9", "Ngoài main"));
    document.body.appendChild(inbox);
    expect(await locateInboxList(locate)).toBe(inbox);
    expect((await collectInboxItems(locate)).map((item) => item.messageId)).toEqual(["mail-9"]);
  });
});
