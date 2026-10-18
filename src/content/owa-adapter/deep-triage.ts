// src/content/owa-adapter/deep-triage.ts — quét SÂU toàn bộ folder (UAT 17/10): cuộn dần danh
// sách ảo hóa để tải hết mail vào DOM (mấy trăm mail — OWA chỉ giữ ~11 row hiển thị). Cuộn
// KHÔNG đổi trạng thái đã đọc (yêu cầu bắt buộc); LLM vẫn bị triageCap chặn ở tầng digest (EF-5).
// Nối module deep-scan với primitive của triage — tránh import cycle runtime (deep-scan chỉ
// import TYPE từ triage; module này import runtime cả hai, không ai import ngược lại nó).
import { deepScanCollect, type DeepScanDeps } from "./deep-scan";
import { locateInboxList } from "./inbox-list-locator";
import { loadMoreByScroll } from "./list-scroller";
import { trustedScrollAdvance, trustedScrollDetach } from "./trusted-scroll";
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
export async function collectUnreadItemsDeep(locate: LocateFn, deps?: DeepScanDeps): Promise<InboxItem[]> {
  const unread = new Map<string, InboxItem>();
  const unreadElements = new Map<string, Element>();
  await deepScanCollect(locate, (items, elements) => {
    for (const item of items) {
      const element = elements.get(item.messageId);
      if (element === undefined || unread.has(item.messageId)) continue;
      if (isUnreadItem(element)) {
        unread.set(item.messageId, item);
        unreadElements.set(item.messageId, element);
      }
    }
  }, {}, deps ?? deepDeps());
  replaceCurrentScan(unreadElements); // findItemElement (👁/↗) tra theo lần quét này
  console.info(`[AIMH][triage] unread deep: ${unread.size} mail chưa đọc (cuộn quét toàn folder, chỉ đọc DOM)`);
  return Array.from(unread.values());
}
