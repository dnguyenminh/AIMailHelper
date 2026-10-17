// src/content/owa-adapter/deep-scan.ts — quét SÂU toàn bộ folder: danh sách mail của OWA là
// virtualized (chỉ ~10-15 row nằm trong DOM) nên quét thường chỉ thấy số mail đang hiển thị.
// Module này CUỘN DẦN danh sách để OWA render thêm row, thu thập đến hết folder hoặc chạm cap.
// UAT 17/10: user có mấy trăm mail chưa đọc nhưng quét thường chỉ thấy 11 mail trên màn hình.
// An toàn: cuộn = chỉ di chuyển viewport + chờ render — KHÔNG click mail → KHÔNG đổi trạng
// thái đã đọc/chưa đọc (yêu cầu bắt buộc). LLM vẫn bị triageCap chặn ở tầng digest (EF-5).
import { AppError } from "../../shared/errors";
import type { InboxItem, LocateFn } from "./triage";

const ITEM_SELECTOR = '[role="option"], [role="listitem"]';
const LIST_CONTAINER = '[role="listbox"], [role="list"]';
const GROW_TIMEOUT_MS = 2500; // chờ tối đa sau mỗi lần cuộn (OWA có thể fetch server thêm page)
const GROW_POLL_MS = 250;
const NO_GROWTH_STOP = 2; // hết row mới N round liên tiếp → coi như đã hết folder

export interface DeepScanOptions {
  maxItems?: number; // cap an toàn — mặc định 500 (khớp triageCap tối đa ở Options), chặn giữa các round
  maxRounds?: number;
}

export interface DeepScanDeps {
  collect: (locate: LocateFn) => Promise<InboxItem[]>; // = collectInboxItems (tự điền currentScan)
  findElement: (messageId: string) => Element | null; // = findItemElement (đọc currentScan)
  locateList: (locate: LocateFn) => Promise<Element | null>; // = locateInboxList
  loadMore?: (list: Element) => Promise<boolean>; // mặc định: cuộn xuống đáy + chờ row mới
}

const DEFAULTS: Required<DeepScanOptions> = { maxItems: 500, maxRounds: 150 };

interface RoundResult {
  items: InboxItem[]; // item MỚI round này (chưa từng thấy)
  elements: Map<string, Element>; // element CÒN KẾT NỐI của item mới (caller check unread ngay)
}

// Tìm ancestor cuộn được (overflow auto/scroll, còn dư nội dung) — BẮT ĐẦU từ chính list
// (listbox của OWA có thể là scroller), đi lên ancestor. Không thấy → caller dùng fallback.
function findScrollContainer(list: Element): HTMLElement | null {
  let node: HTMLElement | null = list instanceof HTMLElement ? list : null;
  try {
    while (node !== null && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight - node.clientHeight > 20) return node;
      node = node.parentElement;
    }
  } catch {
    return null; // jsdom / môi trường hạn chế — bỏ qua cuộn trực tiếp
  }
  return null;
}

// Container mail list CÓ THỂ bị OWA thay thế sau khi cuộn (React re-render) — LUÔN tra lại
// trong document: chọn container có NHIỀU row nhất (mail list luôn thắng attachment strip).
function liveMailList(): Element | null {
  let best: Element | null = null;
  let bestCount = 0;
  for (const box of Array.from(document.querySelectorAll(LIST_CONTAINER))) {
    const count = box.querySelectorAll(ITEM_SELECTOR).length;
    if (count > bestCount) { best = box; bestCount = count; }
  }
  return best;
}

// Nhảy ĐÁY container cuộn — gán scrollTop kích hoạt native scroll event (virtualizer Fluent
// nghe scroll), kèm wheel event fallback. KHÔNG click mail, KHÔNG dispatch MouseEvent → không
// đổi trạng thái đã đọc.
function jumpToBottom(scroller: HTMLElement): void {
  try {
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 1200, bubbles: true, cancelable: true }));
  } catch {
    /* jsdom không có WheelEvent — bỏ qua, vòng lặp test vẫn chạy với loadMore giả */
  }
}

// Cuộn để OWA render thêm row. Cuộn container CUỘN THẬT (tra lại trong document — list truyền
// vào có thể đã bị thay thế); scrollIntoView chỉ là fallback khi không tìm thấy scroller.
// Chờ row mới tối đa GROW_TIMEOUT_MS (OWA có thể fetch server page tiếp theo).
async function loadMoreByScroll(_list: Element): Promise<boolean> {
  const list = liveMailList() ?? _list;
  const before = list.querySelectorAll(ITEM_SELECTOR).length;
  const scroller = findScrollContainer(list);
  if (scroller === null) {
    const rows = list.querySelectorAll(ITEM_SELECTOR);
    const last = rows[rows.length - 1];
    try { if (last !== undefined) (last as HTMLElement).scrollIntoView({ block: "end" }); } catch { /* jsdom */ }
  } else {
    jumpToBottom(scroller);
  }
  for (let waited = 0; waited < GROW_TIMEOUT_MS; waited += GROW_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, GROW_POLL_MS));
    const fresh = liveMailList();
    if (fresh !== null && fresh.querySelectorAll(ITEM_SELECTOR).length > before) return true;
  }
  console.info(`[AIMH][deep-scan] cuộn không thêm row — scroller: ${scroller === null ? "KHÔNG tìm thấy" : `${scroller.tagName} ${scroller.scrollTop}/${scroller.scrollHeight}`}, rows ${before}`);
  return false;
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
    if (noGrowth >= NO_GROWTH_STOP) return; // hết folder — 2 round liên tiếp không có mail mới
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
  const scroller = findScrollContainer(list);
  const savedTop = scroller?.scrollTop ?? 0;
  console.info(`[AIMH][deep-scan] scroll container: ${scroller === null ? "KHÔNG thấy (dùng fallback scrollIntoView)" : `${scroller.tagName} cuộn ${scroller.scrollHeight}/${scroller.clientHeight}px`}`);
  const merged = new Map<string, InboxItem>();
  try {
    await scanRounds(locate, visitRound, opts, deps, list, merged);
  } finally {
    if (scroller !== null) {
      try { scroller.scrollTop = savedTop; } catch { /* phục hồi cuộn best-effort */ }
    }
  }
  console.info(`[AIMH][deep-scan] hoàn tất: ${merged.size} mail (cap ${opts.maxItems})`);
  return Array.from(merged.values());
}
