// src/content/owa-adapter/deep-scan.test.ts — UAT 17/10: quét SÂU toàn folder (OWA virtualized
// list — chỉ ~11 row trong DOM). Fake loadMore mô phỏng OWA render thêm row khi cuộn: pages
// tăng dần → dedupe theo messageId, dừng khi hết row mới (2 round liên tiếp) hoặc đạt cap.
// Cuộn/fake KHÔNG click mail → không đổi trạng thái đã đọc (yêu cầu bắt buộc).
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../shared/errors";
import { deepScanCollect } from "./deep-scan";
import type { DeepScanDeps } from "./deep-scan";
import { collectInboxItems, findItemElement } from "./triage";
import { collectInboxItemsDeep, collectUnreadItemsDeep } from "./deep-triage";
import type { InboxItem, LocateFn } from "./triage";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildList(): HTMLElement {
  const list = el("div", { role: "list", "aria-label": "Message list" });
  document.body.appendChild(list);
  return list;
}

// Row đủ dữ liệu: S1 data-itemid + subject (heading) + From aria-label. unread → aria-label Unread.
function addRow(list: HTMLElement, id: string, subject: string, unread = false): void {
  const row = el("div", { role: "listitem", "data-itemid": id });
  if (unread) row.setAttribute("aria-label", "Unread message from " + id);
  row.appendChild(el("h3", { role: "heading" }, subject));
  row.appendChild(el("span", { "aria-label": "From: a@x.vn" }, ""));
  list.appendChild(row);
}

const locateFromList = (list: Element | null): LocateFn => async (key) =>
  key === "inbox-list" ? list : null;

function makeDeps(list: Element | null, loadMore?: () => Promise<boolean>): DeepScanDeps {
  return {
    collect: (locate) => collectInboxItems(locate),
    findElement: (id) => findItemElement(id),
    locateList: async () => list,
    loadMore
  };
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("deepScanCollect — quét sâu folder ảo hóa (cuộn để tải thêm row)", () => {
  it("pages tăng dần: gộp dedupe, visitRound chỉ nhận item MỚI, dừng khi 2 round không có mail mới", async () => {
    const list = buildList();
    addRow(list, "m1", "Thư 1");
    addRow(list, "m2", "Thư 2", true);
    let call = 0;
    const deps = makeDeps(list, async () => {
      call += 1;
      if (call === 1) { addRow(list, "m3", "Thư 3", true); addRow(list, "m4", "Thư 4"); return true; }
      return false; // hết folder — OWA không render thêm
    });
    const rounds: string[][] = [];
    const merged = await deepScanCollect(locateFromList(list), (items) => {
      rounds.push(items.map((item) => item.messageId));
    }, { maxRounds: 10 }, deps);
    expect(rounds).toEqual([["m1", "m2"], ["m3", "m4"]]); // visitRound = item mới từng round
    expect(merged.map((item) => item.messageId)).toEqual(["m1", "m2", "m3", "m4"]); // dedupe
  });

  it("maxItems cap chặn vòng lặp giữa các round (an toàn chi phí)", async () => {
    const list = buildList();
    addRow(list, "m1", "Thư 1");
    let call = 0;
    const deps = makeDeps(list, async () => {
      call += 1;
      if (call === 1) addRow(list, "m2", "Thư 2");
      if (call === 2) addRow(list, "m3", "Thư 3"); // không bao giờ đến round này
      return true;
    });
    const merged = await deepScanCollect(locateFromList(list), () => undefined, { maxItems: 2 }, deps);
    expect(merged.map((item) => item.messageId)).toEqual(["m1", "m2"]);
  });

  it("không thấy inbox-list → ERR-06 (panel gợi ý Diagnose)", async () => {
    const deps = makeDeps(null);
    const error = await deepScanCollect(locateFromList(null), () => undefined, {}, deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("ERR-06");
  });
});

describe("collectInboxItemsDeep / collectUnreadItemsDeep — quét sâu + lọc chưa đọc", () => {
  it("collectInboxItemsDeep: tất cả mail mọi page (không chỉ mail đang hiển thị)", async () => {
    const list = buildList();
    addRow(list, "m1", "Thư 1");
    const deps = makeDeps(list, async () => {
      if (list.querySelectorAll('[role="listitem"]').length < 3) { addRow(list, "m2", "Thư 2"); addRow(list, "m3", "Thư 3"); return true; }
      return false;
    });
    const items = await collectInboxItemsDeep(locateFromList(list), deps);
    expect(items.map((item) => item.messageId)).toEqual(["m1", "m2", "m3"]);
  });

  it("collectUnreadItemsDeep: lọc CHỈ chưa đọc qua mọi page; currentScan có element (👁/↗ dùng được)", async () => {
    const list = buildList();
    addRow(list, "u1", "Mới 1", true);
    addRow(list, "r1", "Đã đọc 1");
    const deps = makeDeps(list, async () => {
      if (list.querySelectorAll('[role="listitem"]').length < 3) { addRow(list, "u2", "Mới 2", true); addRow(list, "r2", "Đã đọc 2"); return true; }
      return false;
    });
    const items: InboxItem[] = await collectUnreadItemsDeep(locateFromList(list), deps);
    expect(items.map((item) => item.messageId)).toEqual(["u1", "u2"]);
    expect(findItemElement("u1")).not.toBeNull(); // scroll/open từ Digest hoạt động
    expect(findItemElement("r1")).toBeNull(); // mail đã đọc không vào scan hiện tại
  });
});
