// src/content/owa-adapter/deep-triage.ts — quét SÂU toàn bộ folder (UAT 17/10): cuộn dần danh
// sách ảo hóa để tải hết mail vào DOM (mấy trăm mail — OWA chỉ giữ ~11 row hiển thị). Cuộn
// KHÔNG đổi trạng thái đã đọc (yêu cầu bắt buộc); LLM vẫn bị triageCap chặn ở tầng digest (EF-5).
// Nối module deep-scan với primitive của triage — tránh import cycle runtime (deep-scan chỉ
// import TYPE từ triage; module này import runtime cả hai, không ai import ngược lại nó).
import { deepScanCollect, type DeepScanDeps } from "./deep-scan";
import { locateInboxList } from "./inbox-list-locator";
import { loadMoreByScroll } from "./list-scroller";
import { trustedScrollAdvance, trustedScrollDetach, trustedScrollToTop } from "./trusted-scroll";
import { collectInboxItems, findItemElement, isUnreadItem, replaceCurrentScan } from "./triage";
import type { InboxItem, LocateFn } from "./triage";

// Cuộn LAI (UAT 18/10): synthetic wheel trước (OWA cũ — rẻ, 0 permission); thất bại →
// trusted-scroll qua chrome.debugger (OWA mới chỉ nhận input isTrusted — SPIKE §7.1).
async function hybridLoadMore(list: Element): Promise<boolean> {
  try {
    if (await loadMoreByScroll(list)) return true;
  } catch {
    /* synthetic thất bại — thử trusted */
  }
  return trustedScrollAdvance();
}

// Deps mặc định — nối primitive có sẵn của triage vào vòng lặp deep-scan.
function deepDeps(): DeepScanDeps {
  return {
    collect: collectInboxItems,
    findElement: findItemElement,
    locateList: locateInboxList,
    loadMore: hybridLoadMore,
    resetToTop: trustedScrollToTop, // uat81 — quét luôn bắt đầu từ mail mới nhất
    onScanEnd: () => trustedScrollDetach() // infobar "đang gỡ lỗi" tắt khi quét xong
  };
}

// Quét sâu TẤT CẢ mail trong folder (dedupe theo messageId). Hạn chế ghi nhận: 👁/↗ chỉ hoạt
// động với mail còn trong DOM hiện tại (isConnected check ở facade scrollToItem/openItem).
export async function collectInboxItemsDeep(locate: LocateFn, deps?: DeepScanDeps): Promise<InboxItem[]> {
  return deepScanCollect(locate, () => undefined, {}, deps ?? deepDeps());
}

// Quét sâu + lọc CHỈ mail chưa đọc. Check isUnreadItem NGAY trong visitRound — TRƯỚC khi OWA
// virtualize row khỏi DOM (element detach → computed style rỗng → mất signal bold).
// uat80 — WATERMARK TĂNG DẦN: lưu ids mail đầu lần quét trước (chrome.storage.local); lần sau
// gặp ≥3 mail đã biết liên tiếp → dừng sớm (mail mới luôn nằm trên). full=true (Quét lại) bỏ mốc.
const WATERMARK_KEY = "unread.watermark.v1";
const WATERMARK_MAX_IDS = 300;
const STOP_AFTER_KNOWN = 3;

async function loadKnownIds(): Promise<Set<string>> {
  try {
    if (typeof chrome === "undefined" || chrome.storage?.local === undefined) return new Set();
    const got = await chrome.storage.local.get(WATERMARK_KEY);
    const ids = (got?.[WATERMARK_KEY] as { ids?: string[] } | undefined)?.ids ?? [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

async function saveWatermark(ids: string[]): Promise<void> {
  try {
    if (typeof chrome === "undefined" || chrome.storage?.local === undefined) return;
    await chrome.storage.local.set({ [WATERMARK_KEY]: { ids: ids.slice(0, WATERMARK_MAX_IDS), at: Date.now() } });
  } catch {
    /* quota — bỏ qua; lần sau quét lại toàn bộ */
  }
}

export async function collectUnreadItemsDeep(locate: LocateFn, deps?: DeepScanDeps, opts?: { full?: boolean }): Promise<InboxItem[]> {
  const unread = new Map<string, InboxItem>();
  const unreadElements = new Map<string, Element>();
  const known = opts?.full === true ? new Set<string>() : await loadKnownIds();
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  let knownStreak = 0;
  await deepScanCollect(locate, (items, elements) => {
    for (const item of items) {
      if (seen.has(item.messageId) === false) { seen.add(item.messageId); seenOrder.push(item.messageId); }
      const element = elements.get(item.messageId);
      if (element === undefined || unread.has(item.messageId)) continue;
      if (isUnreadItem(element)) {
        unread.set(item.messageId, item);
        unreadElements.set(item.messageId, element);
      }
    }
  }, { stopWhen: (item) => {
    if (known.has(item.messageId) === false) { knownStreak = 0; return false; }
    knownStreak += 1;
    return knownStreak >= STOP_AFTER_KNOWN; // ≥3 mail đã biết liên tiếp → hết vùng mới — dừng
  } }, deps ?? deepDeps());
  replaceCurrentScan(unreadElements); // findItemElement (👁/↗) tra theo lần quét này
  await saveWatermark(seenOrder); // mốc tăng dần cho lần quét sau
  console.info(`[AIMH][triage] unread deep: ${unread.size} mail chưa đọc (quét tăng dần theo watermark)`);
  return Array.from(unread.values());
}
