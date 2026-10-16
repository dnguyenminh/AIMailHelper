// src/content/owa-adapter/triage.test.ts — GĐ5 §3.1.6: quét inbox ĐANG HIỂN THỊ (BR-07 — KHÔNG
// tải thêm mail ngoài list), message-id chain S1/S2/S3 (§7.5), ERR-12 bỏ qua + log (FR-GD5-06),
// badge createElement/textContent (SR-10) màu theo score, folder guard EF-2/EF-4.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../shared/errors";
import { attachBadge, collectInboxItems, collectUnreadItems, hasFolderChanged, isUnreadItem, readFolderSignature } from "./triage";
import type { LocateFn } from "./triage";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

interface RowSpec {
  idAttr?: string; // S1
  href?: string; // S2
  subject: string;
  sender?: string;
  preview?: string;
  unreadLabel?: string; // aria-label row: "Unread ..." / "... chưa đọc"
  markReadButton?: boolean; // nút "Mark as read" — chỉ xuất hiện trên row chưa đọc
}

function buildInbox(rows: RowSpec[]): HTMLElement {
  const list = el("div", { role: "list", "aria-label": "Message list" });
  for (const row of rows) {
    const item = el("div", { role: "listitem" });
    if (row.idAttr !== undefined) item.setAttribute("data-itemid", row.idAttr);
    if (row.unreadLabel !== undefined) item.setAttribute("aria-label", row.unreadLabel);
    if (row.href !== undefined) item.appendChild(el("a", { href: row.href }, "mở"));
    item.appendChild(el("h3", { role: "heading" }, row.subject));
    if (row.sender !== undefined) item.appendChild(el("span", { "aria-label": "From: " + row.sender }, ""));
    if (row.preview !== undefined) item.appendChild(el("span", { "aria-label": "preview" }, row.preview));
    if (row.markReadButton === true) item.appendChild(el("button", { "aria-label": "Mark as read" }, ""));
    list.appendChild(item);
  }
  document.body.appendChild(list);
  return list;
}

const locateFromList = (list: Element | null): LocateFn => async (key) =>
  key === "inbox-list" ? list : key === "inbox-item" ? list?.querySelector('[role="listitem"]') ?? null : null;

beforeEach(() => {
  document.body.textContent = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectInboxItems — FR-GD5-01 + BR-07 (chỉ item đang hiển thị)", () => {
  it("3 items: S1 attribute → S2 href AAMk → S3 synthetic; đủ subject/sender/snippet", async () => {
    const list = buildInbox([
      { idAttr: "AAMk-native-1", subject: "Báo giá tháng 10", sender: "An <an@x.vn>", preview: "Vui lòng xem báo giá" },
      { href: "/link/AAMkABCDEFGHIJKLMN0123456789+/=", subject: "Nhắc hạn chót", sender: "binh@y.vn", preview: "Hạn là thứ Sáu" },
      { subject: "Không có id", sender: "chi@z.vn", preview: "Nội dung ngắn" }
    ]);
    const items = await collectInboxItems(locateFromList(list));
    expect(items).toHaveLength(3);
    expect(items[0]?.messageId).toBe("AAMk-native-1"); // S1
    expect(items[0]?.provenance).toBe("native");
    expect(items[1]?.messageId).toBe("AAMkABCDEFGHIJKLMN0123456789+/="); // S2
    expect(items[2]?.provenance).toBe("synthetic"); // S3
    expect(items[2]?.messageId).toMatch(/^synthetic:[0-9a-f]{16}$/); // SHA-256 trunc 16 (SR-09)
    expect(items[0]?.subject).toBe("Báo giá tháng 10");
    expect(items[0]?.sender).toBe("An <an@x.vn>");
    expect(items[0]?.snippet).toContain("Vui lòng xem báo giá");
  });

  it("BR-07: CHỈ duyệt item trong inbox-list — listitem ngoài list không bị quét", async () => {
    buildInbox([{ idAttr: "in-list-1", subject: "Trong list", sender: "a@x.vn" }]);
    const stray = el("div", { role: "listitem" });
    stray.appendChild(el("h3", { role: "heading" }, "Ngoài list"));
    document.body.appendChild(stray);
    const items = await collectInboxItems(locateFromList(document.querySelector('[role="list"]')));
    expect(items).toHaveLength(1);
    expect(items[0]?.messageId).toBe("in-list-1");
  });

  // FR-GD5-06 / ERR-12 — item không đủ dữ liệu cả 3 strategy → bỏ qua + log, batch không gián đoạn.
  it("item rỗng (không id, không subject/sender/preview) → bỏ qua + console.warn ERR-12", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const list = buildInbox([
      { idAttr: "ok-1", subject: "Bình thường", sender: "a@x.vn" },
      { subject: "", sender: "", preview: "" }
    ]);
    const items = await collectInboxItems(locateFromList(list));
    expect(items).toHaveLength(1);
    expect(items[0]?.messageId).toBe("ok-1");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("ERR-12");
  });

  it("không thấy inbox-list → ERR-06 (panel gợi ý Diagnose)", async () => {
    const error = await collectInboxItems(locateFromList(null)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("ERR-06");
  });
});

describe("attachBadge — UAT-3 fail-safe (KHÔNG mutate DOM OWA — React layout vỡ)", () => {
  it("LUÔN trả false, không chèn badge nào vào DOM (badge hiển thị trong Digest panel)", async () => {
    const list = buildInbox([
      { idAttr: "hi", subject: "Cao", sender: "a@x.vn" },
      { idAttr: "mid", subject: "Trung bình", sender: "b@x.vn" },
      { idAttr: "lo", subject: "Thấp", sender: "c@x.vn" }
    ]);
    await collectInboxItems(locateFromList(list));
    expect(attachBadge("hi", 85)).toBe(false); // fail-safe — không đụng DOM OWA
    expect(attachBadge("mid", 55)).toBe(false);
    expect(attachBadge("lo", 12)).toBe(false);
    expect(list.querySelectorAll(".aimh-triage-badge")).toHaveLength(0);
  });

  it("id lạ cũng false — hành vi thống nhất (không phân biệt)", async () => {
    const list = buildInbox([{ idAttr: "m1", subject: "S", sender: "a@x.vn" }]);
    await collectInboxItems(locateFromList(list));
    expect(attachBadge("m1", 90)).toBe(false);
    expect(attachBadge("không-tồn-tại", 50)).toBe(false);
    expect(list.querySelectorAll(".aimh-triage-badge")).toHaveLength(0);
  });
});

describe("collectUnreadItems — UAT (chỉ mail chưa đọc, KHÔNG đổi trạng thái mail)", () => {
  it("isUnreadItem: aria-label Unread/chưa đọc → true; nút Mark as read → true; row thường → false", () => {
    const list = buildInbox([
      { idAttr: "u1", subject: "Mới 1", unreadLabel: "Unread message from A" },
      { idAttr: "u2", subject: "Mới 2", unreadLabel: "Thư chưa đọc từ B" },
      { idAttr: "u3", subject: "Mới 3", markReadButton: true },
      { idAttr: "r1", subject: "Đã đọc" }
    ]);
    const rows = Array.from(list.querySelectorAll('[role="listitem"]'));
    expect(isUnreadItem(rows[0] as Element)).toBe(true);
    expect(isUnreadItem(rows[1] as Element)).toBe(true);
    expect(isUnreadItem(rows[2] as Element)).toBe(true);
    expect(isUnreadItem(rows[3] as Element)).toBe(false);
  });

  it("collectUnreadItems: chỉ trả item chưa đọc, không click/không mở mail (read-only DOM)", async () => {
    const list = buildInbox([
      { idAttr: "u1", subject: "Mới", sender: "a@x.vn", unreadLabel: "Unread" },
      { idAttr: "r1", subject: "Cũ", sender: "b@x.vn" }
    ]);
    const clicks: string[] = [];
    list.addEventListener("click", () => clicks.push("row"));
    const items = await collectUnreadItems(locateFromList(list));
    expect(items.map((item) => item.messageId)).toEqual(["u1"]);
    expect(clicks).toEqual([]); // không có click nào được dispatch
    expect(list.querySelectorAll(".aimh-triage-badge")).toHaveLength(0); // không mutate DOM
  });

  it("không có mail chưa đọc → mảng rỗng (panel hiện empty, không lỗi)", async () => {
    const list = buildInbox([{ idAttr: "r1", subject: "Cũ", sender: "b@x.vn" }]);
    const items = await collectUnreadItems(locateFromList(list));
    expect(items).toEqual([]);
  });
});

describe("folder guard — EF-2/EF-4 (dừng an toàn giữa chừng)", () => {
  it("cùng container → không đổi; container bị thay/tháo khỏi DOM → đã đổi", async () => {
    const list = buildInbox([{ idAttr: "m1", subject: "S", sender: "a@x.vn" }]);
    const signature = await readFolderSignature(locateFromList(list));
    expect(signature).toBe(list);
    expect(await hasFolderChanged(signature, locateFromList(list))).toBe(false);
    // Đổi folder: container cũ bị tháo, list mới render
    const newList = buildInbox([{ idAttr: "m2", subject: "Folder khác", sender: "b@x.vn" }]);
    list.remove();
    expect(await hasFolderChanged(signature, locateFromList(newList))).toBe(true); // container khác
    expect(await hasFolderChanged(list, locateFromList(newList))).toBe(true); // cũ đã disconnect
  });
});
