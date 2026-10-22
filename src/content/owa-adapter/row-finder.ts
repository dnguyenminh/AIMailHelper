// src/content/owa-adapter/row-finder.ts — uat62/uat63: tìm row inbox SỐNG theo messageId cho 👁/↗.
// Bug: sau deep-scan OWA virtualize row khỏi DOM → element trong currentScan đã detach →
// scrollToItem/openItem trả false im lặng ("không có chuyện gì xảy ra").
// Chiến lược: (1) native attribute probe; (2) rescan DOM hiện tại + so messageId (synthetic
// id khớp vì cùng subject/sender/preview); (3) scroll-search danh sách ảo hóa top→bottom —
// scroller dùng findListScroller (anchor region + hidden-scroller — cùng primitive deep-scan).
// CHỈ ĐỌC: không click, không mutate DOM (SR-10).
import { findListScroller, liveMailList } from "./list-scroller";
import { locateInboxList } from "./inbox-list-locator";
import { SELECTOR_CHAINS } from "./selectors";
import { trustedScrollBurst } from "./trusted-scroll";
import { readItem } from "./triage";
import type { LocateFn } from "./triage";

const ROW_SELECTOR = SELECTOR_CHAINS["inbox-item"].join(",");
const SCROLL_STEP_WAIT_MS = 280; // chờ OWA render lại row sau khi cuộn (virtualization)
const MAX_SCROLL_STEPS = 80; // pha C (scrollTop) — folder ~vài trăm mail
const MAX_BURSTS = 15; // pha A/B — mỗi burst = 3 gesture × 1200px
const ID_ATTRIBUTES = ["data-itemid", "data-convid", "data-message-id"] as const;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// CSS.escape thiếu trong jsdom — fallback tự escape quote/backslash (đủ cho attribute selector).
function attrValueSafe(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/(["\\])/g, "\\$1");
}

function rowOf(el: Element): Element | null {
  return el.closest(ROW_SELECTOR);
}

// Probe nhanh theo attribute native (data-itemid/data-convid/data-message-id) — O(1) query.
function probeNative(messageId: string): Element | null {
  for (const attr of ID_ATTRIBUTES) {
    const hit = document.querySelector("[" + attr + '="' + attrValueSafe(messageId) + '"]');
    if (hit !== null) {
      const row = rowOf(hit);
      if (row !== null) return row;
    }
  }
  return null;
}

// Tìm row trong DOM HIỆN TẠI — synthetic id vẫn khớp nhờ rescan + so messageId.
export async function findLiveRow(messageId: string, locate: LocateFn): Promise<Element | null> {
  const native = probeNative(messageId);
  if (native !== null) return native;
  const list = await locateInboxList(locate);
  if (list === null) return null;
  for (const row of Array.from(list.querySelectorAll(ROW_SELECTOR))) {
    const item = await readItem(row);
    if (item !== null && item.messageId === messageId) return row;
  }
  return null;
}

// Gán scrollTop + wheel burst — React virtualizer của OWA nghe cả scroll lẫn wheel.
function scrollTo(scroller: HTMLElement, top: number): void {
  try {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 600, bubbles: true, cancelable: true }));
  } catch {
    /* jsdom không có WheelEvent — bỏ qua */
  }
}

// Tìm row; nếu đang ngoài DOM (virtualized) → CUỘN danh sách bằng TRUSTED GESTURE (uat63):
// OWA mới BỎ QUA scrollTop/synthetic wheel (virtualizer chỉ nhận isTrusted — trusted-scroll.ts)
// nên scroll-search phải dùng cùng primitive với deep-scan. Thứ tự: cuộn LÊN (deep-scan để
// list ở đáy — mail cần tìm thường ở trên) → cuộn XUỐNG → fallback scrollTop (OWA cũ).
// Hết 2 pha không thấy → null (caller warn cho user, không im lặng). stepWaitMs inject (test).
export async function scrollSearchRow(messageId: string, locate: LocateFn, stepWaitMs = SCROLL_STEP_WAIT_MS): Promise<Element | null> {
  let found = await findLiveRow(messageId, locate);
  if (found !== null) return found;
  const list = liveMailList() ?? await locateInboxList(locate);
  if (list === null) return null;
  const rect = list.getBoundingClientRect();
  const cx = Math.round(rect.left + rect.width / 2);
  const cy = Math.round(rect.top + rect.height / 2);
  const firstRowId = async (): Promise<string> => {
    const box = liveMailList() ?? list;
    const first = box.querySelector(ROW_SELECTOR);
    if (first === null) return "";
    const item = await readItem(first);
    return item?.messageId ?? "";
  };
  const lastRowId = async (): Promise<string> => {
    const box = liveMailList() ?? list;
    const rows = box.querySelectorAll(ROW_SELECTOR);
    const last = rows[rows.length - 1];
    if (last === undefined) return "";
    const item = await readItem(last);
    return item?.messageId ?? "";
  };
  // PHA A — trusted cuộn LÊN tới đỉnh (first row không đổi 2 lần liên tiếp = chạm đỉnh)
  let prevFirst = await firstRowId();
  let stableUp = 0;
  for (let i = 0; i < MAX_BURSTS && found === null && stableUp < 2; i += 1) {
    try { await trustedScrollBurst(cx, cy, -1200); } catch { break; } // gesture lỗi → pha B
    await sleep(stepWaitMs);
    found = await findLiveRow(messageId, locate);
    if (found !== null) return found;
    const first = await firstRowId();
    stableUp = first === prevFirst ? stableUp + 1 : 0;
    prevFirst = first;
  }
  // PHA B — trusted cuộn XUỐNG tới đáy (last row không đổi 2 lần liên tiếp = chạm đáy)
  let prevLast = await lastRowId();
  let stableDown = 0;
  for (let i = 0; i < MAX_BURSTS && found === null && stableDown < 2; i += 1) {
    try { await trustedScrollBurst(cx, cy, 1200); } catch { break; }
    await sleep(stepWaitMs);
    found = await findLiveRow(messageId, locate);
    if (found !== null) return found;
    const last = await lastRowId();
    stableDown = last === prevLast ? stableDown + 1 : 0;
    prevLast = last;
  }
  if (found !== null) return found;
  // PHA C — fallback scrollTop (OWA cũ nhận programmatic scroll)
  const scroller = findListScroller(list) ?? (list as HTMLElement);
  const savedTop = scroller.scrollTop;
  scrollTo(scroller, 0);
  await sleep(stepWaitMs);
  found = await findLiveRow(messageId, locate);
  for (let step = 0; step < MAX_SCROLL_STEPS && found === null; step += 1) {
    const before = scroller.scrollTop;
    scrollTo(scroller, before + Math.max(240, Math.floor(scroller.clientHeight * 0.8)));
    await sleep(stepWaitMs);
    found = await findLiveRow(messageId, locate);
    if (found !== null) return found;
    if (scroller.scrollTop === before) break;
  }
  scrollTo(scroller, savedTop);
  await sleep(stepWaitMs);
  return null;
}
