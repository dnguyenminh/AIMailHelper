// src/content/owa-adapter/deep-scan.ts — quét SÂU toàn bộ folder: danh sách mail OWA là
// virtualized (chỉ ~12 row nằm trong DOM) nên quét thường chỉ thấy số mail đang hiển thị.
// Vòng lặp: CUỘN (list-scroller.ts) → OWA render thêm row → thu thập (dedupe theo messageId)
// → lặp đến hết folder hoặc đạt cap. UAT 17-18/10: user có hàng trăm mail chưa đọc nhưng quét
// thường chỉ thấy 11-12 mail. An toàn: cuộn KHÔNG click mail → KHÔNG đổi trạng thái đã đọc
// (yêu cầu bắt buộc). LLM vẫn bị triageCap chặn ở tầng digest (EF-5).
import { AppError } from "../../shared/errors";
import type { InboxItem, LocateFn } from "./triage";
import { describeScroller, findListScroller, loadMoreByScroll } from "./list-scroller";

export interface DeepScanOptions {
  maxItems?: number; // cap an toàn — mặc định 500 (khớp triageCap tối đa ở Options), chặn giữa các round
  maxRounds?: number;
}

export interface DeepScanDeps {
  collect: (locate: LocateFn) => Promise<InboxItem[]>; // = collectInboxItems (tự điền currentScan)
  findElement: (messageId: string) => Element | null; // = findItemElement (đọc currentScan)
  locateList: (locate: LocateFn) => Promise<Element | null>; // = locateInboxList
  loadMore?: (list: Element) => Promise<boolean>; // mặc định: lai synthetic + trusted (deep-triage)
  onScanEnd?: () => Promise<void>; // dọn dẹp cuối quét (detach debugger — infobar tắt)
}

const DEFAULTS: Required<DeepScanOptions> = { maxItems: 500, maxRounds: 150 };
const NO_GROWTH_STOP = 3; // hết row mới N round liên tiếp → coi như đã hết folder

interface RoundResult {
  items: InboxItem[]; // item MỚI round này (chưa từng thấy)
  elements: Map<string, Element>; // element CÒN KẾT NỐI của item mới (caller check unread ngay)
}

// 1 round = thu thập item hiện hữu trong DOM qua deps.collect, gộp item MỚI vào merged
// (dedupe theo messageId — OWA re-render/virtualize lặp lại row), trả kèm element còn kết nối.
async function collectRound(locate: LocateFn, deps: DeepScanDeps, merged: Map<string, InboxItem>): Promise<RoundResult> {
  const fresh: RoundResult = { items: [], elements: new Map<string, Element>() };
  let items: InboxItem[] = [];
  try {
    items = await deps.collect(locate);
  } catch (error) {
    console.warn("[AIMH][deep-scan] round thu thập lỗi — thử round sau:", error);
    return fresh; // ERR-06 nhất thời (re-render) — không hủy cả lần quét
  }
  for (const item of items) {
    if (merged.has(item.messageId)) continue;
    merged.set(item.messageId, item);
    const element = deps.findElement(item.messageId);
    if (element !== null) fresh.elements.set(item.messageId, element);
  }
  fresh.items = items.filter((item) => fresh.elements.has(item.messageId));
  return fresh;
}

async function scanRounds(
  locate: LocateFn,
  visitRound: (items: InboxItem[], elements: Map<string, Element>) => void,
  opts: Required<DeepScanOptions>,
  deps: DeepScanDeps,
  list: Element,
  merged: Map<string, InboxItem>
): Promise<void> {
  const loadMore = deps.loadMore ?? loadMoreByScroll;
  let noGrowth = 0;
  for (let round = 0; round < opts.maxRounds && merged.size < opts.maxItems; round += 1) {
    const before = merged.size;
    const fresh = await collectRound(locate, deps, merged);
    if (fresh.items.length > 0) visitRound(fresh.items, fresh.elements);
    noGrowth = merged.size === before ? noGrowth + 1 : 0;
    if (noGrowth >= NO_GROWTH_STOP) return; // hết folder — N round liên tiếp không có mail mới
    if (merged.size < opts.maxItems) await loadMore(list);
  }
}

// Vòng lặp quét sâu. visitRound nhận item + element CÒN TRONG DOM ngay mỗi round — caller
// cần check isUnreadItem TẠI ĐÓ (row bị virtualize khỏi DOM thì computed style rỗng → mất signal).
// Cuối lần quét PHỤC HỒI vị trí cuộn ban đầu. Cap có thể vượt tối đa 1 trang (chặn giữa round).
export async function deepScanCollect(
  locate: LocateFn,
  visitRound: (items: InboxItem[], elements: Map<string, Element>) => void,
  options: DeepScanOptions,
  deps: DeepScanDeps
): Promise<InboxItem[]> {
  const opts = { ...DEFAULTS, ...options };
  const list = await deps.locateList(locate);
  if (list === null) throw new AppError("ERR-06", "errors.owaNotFound"); // ERR-06 — panel gợi ý Diagnose
  console.info(`[AIMH][deep-scan] scroll container: ${describeScroller(list)}`);
  const merged = new Map<string, InboxItem>();
  // Phục hồi vị trí cuộn sau khi quét — scroller có thể bị React thay thế giữa chừng → best-effort.
  const scroller = findListScroller(list);
  const savedTop = scroller?.scrollTop ?? 0;
  try {
    await scanRounds(locate, visitRound, opts, deps, list, merged);
  } finally {
    if (scroller !== null) { try { scroller.scrollTop = savedTop; } catch { /* best-effort */ } }
    if (deps.onScanEnd) await deps.onScanEnd(); // detach debugger kể cả khi scan lỗi/giữa chừng
  }
  console.info(`[AIMH][deep-scan] hoàn tất: ${merged.size} mail (cap ${opts.maxItems})`);
  return Array.from(merged.values());
}
