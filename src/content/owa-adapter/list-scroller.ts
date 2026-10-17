// src/content/owa-adapter/list-scroller.ts — cuộn danh sách mail ảo hóa của OWA để tải thêm row.
// UAT 18/10: user cung cấp anchor vùng cuộn danh sách: #Skip to message list-region (skip-link
// landmark — id ổn định, KHÔNG class hash). Chuỗi chiến lược tìm scroller:
// (1) scroller NẰM TRONG anchor region (BFS nông — scroller luôn vài tầng đầu);
// (2) ancestor-walk từ listbox: overflow auto/scroll/overlay, hoặc scroller ẩn delta>100
//     (overflow:hidden VẪN cuộn được bằng code scrollTop);
// (3) scrollIntoView row cuối. An toàn: cuộn + wheel KHÔNG click mail → KHÔNG đổi trạng thái
// đã đọc/chưa đọc (yêu cầu bắt buộc).
const ITEM_SELECTOR = '[role="option"], [role="listitem"]';
const LIST_CONTAINER = '[role="listbox"], [role="list"]';
const LIST_REGION_SELECTOR = '[id="Skip to message list-region"]';
const SCROLL_OVERFLOW = /(auto|scroll|overlay)/;
const MIN_SCROLL_DELTA = 20; // scroller chuẩn — overflow hợp lệ + còn dư nội dung
const HIDDEN_SCROLLER_DELTA = 100; // scroller ẩn (overflow:hidden) — phải dư nhiều mới tin
const BFS_MAX_DEPTH = 5; // scroller nằm trong region luôn ở vài tầng đầu
const GROW_TIMEOUT_MS = 2500; // chờ sau mỗi lần cuộn (OWA có thể fetch server page tiếp)
const GROW_POLL_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const scrollDelta = (el: HTMLElement): number => el.scrollHeight - el.clientHeight;

// Container mail CÓ THỂ bị React thay thế sau khi cuộn — LUÔN tra lại trong document: chọn
// container có NHIỀU row nhất (mail list luôn thắng attachment strip trong reading pane).
export function liveMailList(): Element | null {
  let best: Element | null = null;
  let bestCount = 0;
  for (const box of Array.from(document.querySelectorAll(LIST_CONTAINER))) {
    const count = box.querySelectorAll(ITEM_SELECTOR).length;
    if (count > bestCount) { best = box; bestCount = count; }
  }
  return best;
}

// BFS trong anchor region: Ưu TIÊN 1 = overflow hợp lệ (delta > MIN); Ưu TIÊN 2 = scroller ẩn
// (delta > HIDDEN). BFS nông-trước nên match đầu tiên là tầng gần region = scroller chính.
function scrollerInsideRegion(region: HTMLElement): HTMLElement | null {
  const overflowMatch: HTMLElement[] = [];
  const hiddenMatch: HTMLElement[] = [];
  const queue: Array<{ el: HTMLElement; depth: number }> = [{ el: region, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift() as { el: HTMLElement; depth: number };
    const d = scrollDelta(item.el);
    if (d > MIN_SCROLL_DELTA && SCROLL_OVERFLOW.test(window.getComputedStyle(item.el).overflowY)) {
      overflowMatch.push(item.el);
    } else if (d > HIDDEN_SCROLLER_DELTA) {
      hiddenMatch.push(item.el);
    }
    if (item.depth < BFS_MAX_DEPTH) {
      for (const child of Array.from(item.el.children)) {
        if (child instanceof HTMLElement) queue.push({ el: child, depth: item.depth + 1 });
      }
    }
  }
  return overflowMatch[0] ?? hiddenMatch[0] ?? null;
}

// (2) ancestor-walk từ listbox — cùng 2 mức ưu tiên với scrollerInsideRegion.
function findScrollContainer(list: Element): HTMLElement | null {
  let best: HTMLElement | null = null;
  try {
    let node: HTMLElement | null = list instanceof HTMLElement ? list : null;
    while (node !== null) {
      const d = scrollDelta(node);
      if (d > MIN_SCROLL_DELTA && SCROLL_OVERFLOW.test(window.getComputedStyle(node).overflowY)) return node;
      if (d > HIDDEN_SCROLLER_DELTA && (best === null || d > scrollDelta(best))) best = node;
      node = node.parentElement;
    }
  } catch {
    return null; // jsdom / môi trường hạn chế
  }
  return best;
}

// Chuỗi tìm scroller: anchor region (user xác nhận) → ancestor-walk → null (caller fallback).
export function findListScroller(list: Element): HTMLElement | null {
  try {
    const region = document.querySelector(LIST_REGION_SELECTOR);
    if (region instanceof HTMLElement) {
      const inside = scrollerInsideRegion(region);
      if (inside !== null) return inside;
    }
  } catch {
    /* jsdom — rơi xuống ancestor-walk */
  }
  return findScrollContainer(list);
}

// Nhảy ĐÁY scroller — gán scrollTop kích hoạt native scroll event + wheel burst. KHÔNG click
// mail, KHÔNG dispatch MouseEvent → không đổi trạng thái đã đọc.
function jumpToBottom(scroller: HTMLElement): void {
  try {
    scroller.scrollTop = scroller.scrollHeight;
    for (let tick = 0; tick < 3; tick += 1) {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, bubbles: true, cancelable: true }));
    }
  } catch {
    /* jsdom không có WheelEvent — vòng lặp test vẫn chạy với loadMore giả */
  }
}

// Fallback chót — cuộn row cuối vào viewport.
function scrollIntoViewLast(list: Element): void {
  const rows = list.querySelectorAll(ITEM_SELECTOR);
  const last = rows[rows.length - 1];
  if (last === undefined) return;
  try { (last as HTMLElement).scrollIntoView({ block: "end" }); } catch { /* jsdom */ }
}

// Log chẩn đoán khi cuộn thất bại: 8 tầng ancestor kèm overflow + delta — chỉ chính xác chỗ
// scroller thật nằm đâu để tinh chỉnh lần sau.
function logScrollDiagnostics(list: Element, scroller: HTMLElement | null, before: number): void {
  const chain: string[] = [];
  try {
    let node: HTMLElement | null = list instanceof HTMLElement ? list : null;
    for (let depth = 0; node !== null && depth < 8; depth += 1) {
      chain.push(`${node.tagName}(ov=${window.getComputedStyle(node).overflowY},d=${scrollDelta(node)})`);
      node = node.parentElement;
    }
  } catch {
    /* jsdom — bỏ qua */
  }
  console.info(`[AIMH][deep-scan] cuộn không thêm row — scroller: ${scroller === null ? "KHÔNG thấy" : scroller.tagName}, rows ${before}; chain: ${chain.join(" > ")}`);
}

// Cuộn để OWA render thêm row: nhảy đáy scroller (container luôn tra lại MỚI trong document —
// list truyền vào có thể đã bị React thay thế) → chờ row mới → fail thì log chẩn đoán.
export async function loadMoreByScroll(_list: Element): Promise<boolean> {
  const list = liveMailList() ?? _list;
  const before = list.querySelectorAll(ITEM_SELECTOR).length;
  const scroller = findListScroller(list);
  if (scroller === null) scrollIntoViewLast(list);
  else jumpToBottom(scroller);
  for (let waited = 0; waited < GROW_TIMEOUT_MS; waited += GROW_POLL_MS) {
    await sleep(GROW_POLL_MS);
    const fresh = liveMailList();
    if (fresh !== null && fresh.querySelectorAll(ITEM_SELECTOR).length > before) return true;
  }
  logScrollDiagnostics(list, scroller, before);
  return false;
}

// Mô tả scroller cho log khởi động quét sâu (tìm thấy anchor + dung lượng cuộn hay không).
export function describeScroller(list: Element): string {
  const scroller = findListScroller(list);
  return scroller === null
    ? "KHÔNG thấy (dùng fallback scrollIntoView)"
    : `${scroller.tagName} cuộn ${scroller.scrollHeight}/${scroller.clientHeight}px`;
}
