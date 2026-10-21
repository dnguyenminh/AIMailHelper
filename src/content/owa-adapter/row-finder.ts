// src/content/owa-adapter/row-finder.ts — uat62: tìm row inbox SỐNG theo messageId cho 👁/↗.
// Bug: sau deep-scan OWA virtualize row khỏi DOM → element trong currentScan đã detach →
// scrollToItem/openItem trả false im lặng ("không có chuyện gì xảy ra").
// Chiến lược: (1) native attribute probe; (2) rescan DOM hiện tại + so messageId (synthetic
// id khớp vì cùng subject/sender/preview); (3) scroll-search danh sách ảo hóa top→bottom —
// CHỈ ĐỌC: không click, không mutate DOM (SR-10).
import { locateInboxList } from "./inbox-list-locator";
import { SELECTOR_CHAINS } from "./selectors";
import { readItem } from "./triage";
import type { LocateFn } from "./triage";

const ROW_SELECTOR = SELECTOR_CHAINS["inbox-item"].join(",");
const SCROLL_STEP_WAIT_MS = 250; // chờ OWA render lại row sau khi cuộn (virtualization)
const MAX_SCROLL_STEPS = 80; // folder ~vài trăm mail — mỗi bước cuộn ~80% viewport
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

// Ancestor cuộn được (overflow auto/scroll) — container ảo hóa của danh sách inbox.
function scrollableAncestor(el: Element): HTMLElement | null {
  let p: HTMLElement | null = el.parentElement;
  while (p !== null) {
    const style = window.getComputedStyle(p);
    if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight + 10) return p;
    p = p.parentElement;
  }
  return null;
}

// Tìm row; nếu đang ngoài DOM (virtualized) → CUỘN danh sách top→bottom tìm từng bước.
// Hết danh sách không thấy → trả scroll về chỗ cũ + null (caller báo user, không im lặng).
// stepWaitMs inject được (uat62 test: 0 — jsdom không có layout thật).
export async function scrollSearchRow(messageId: string, locate: LocateFn, stepWaitMs = SCROLL_STEP_WAIT_MS): Promise<Element | null> {
  const direct = await findLiveRow(messageId, locate);
  if (direct !== null) return direct;
  const list = await locateInboxList(locate);
  if (list === null) return null;
  const scroller = scrollableAncestor(list) ?? (list as HTMLElement);
  const savedTop = scroller.scrollTop;
  scroller.scrollTop = 0;
  await sleep(stepWaitMs);
  let found = await findLiveRow(messageId, locate);
  if (found !== null) return found;
  for (let step = 0; step < MAX_SCROLL_STEPS && found === null; step += 1) {
    const before = scroller.scrollTop;
    scroller.scrollTop = before + Math.max(240, Math.floor(scroller.clientHeight * 0.8));
    await sleep(stepWaitMs);
    found = await findLiveRow(messageId, locate);
    if (found !== null) return found;
    if (scroller.scrollTop === before) break; // chạm đáy — hết dữ liệu đã load
  }
  scroller.scrollTop = savedTop; // không thấy → trả trải nghiệm về trạng thái cũ
  await sleep(stepWaitMs);
  return null;
}
