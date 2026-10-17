// src/content/owa-adapter/inbox-list-locator.ts — chọn container inbox-list ĐÚNG giữa nhiều
// listbox/list trên trang. UAT 17/10 (outlook.cloud.microsoft): querySelector trả element
// ĐẦU theo DOM order; OWA mới render reading pane (listbox ĐÍNH KÈM file "Screenshot.png")
// TRƯỚC inbox list → T1 "inbox-list" bắt nhầm container đính kèm (console: "0 unread / 1
// items"). Fix: quét TOÀN BỘ document (kể cả ngoài [role=main]), gán item về container sở
// hữu nó (closest), chọn container có NHIỀU item nhất. CHỈ ĐỌC — không click, không mutate.
import type { LocateFn } from "./triage";
import { SELECTOR_CHAINS } from "./selectors";

const LIST_CONTAINER = '[role="listbox"], [role="list"]';
const READING_PANE = '[id="Skip to message-region"]';
const HEADING_PROBE = 'h1, h2, h3, [role="heading"]';

export interface ContainerScore {
  count: number; // item container THỰC SỰ sở hữu — count dominates mọi tie-break
  outside: number; // 1 nếu ngoài reading pane (attachment strip nằm TRONG pane)
  headings: number; // 1 nếu có heading — subject mail có, tên file đính kèm thường không
}

// Số item container sở hữu: item có closest list-container === container. Container lồng
// nhau không đếm trùng — container trong (cụ thể hơn) giữ item của chính nó.
function ownedItemCount(box: Element): number {
  let count = 0;
  for (const item of Array.from(box.querySelectorAll(SELECTOR_CHAINS["inbox-item"].join(",")))) {
    if (item.closest(LIST_CONTAINER) === box) count += 1;
  }
  return count;
}

function scoreContainer(box: Element): ContainerScore {
  return {
    count: ownedItemCount(box),
    outside: box.closest(READING_PANE) === null ? 1 : 0,
    headings: box.querySelectorAll(HEADING_PROBE).length > 0 ? 1 : 0
  };
}

// count dominates — attachment strip (1-3 item) luôn thua inbox list (10-50 item);
// outside/headings chỉ dùng khi count bằng.
function isBetterScore(next: ContainerScore, best: ContainerScore): boolean {
  if (next.count !== best.count) return next.count > best.count;
  if (next.outside !== best.outside) return next.outside > best.outside;
  return next.headings > best.headings;
}

// Thu TẤT CẢ candidate list-container trên trang (hit của locate + mọi listbox/list trong
// document — không giới hạn [role=main] vì inbox list có thể nằm ngoài main trên OWA mới).
function gatherCandidates(hit: Element | null): Set<Element> {
  const candidates = new Set<Element>();
  if (hit !== null) candidates.add(hit);
  for (const box of Array.from(document.querySelectorAll(LIST_CONTAINER))) candidates.add(box);
  return candidates;
}

export async function locateInboxList(locate: LocateFn): Promise<Element | null> {
  const hit = await locate("inbox-list", "danh sách email inbox");
  let best: Element | null = null;
  let bestScore: ContainerScore = { count: 0, outside: 0, headings: 0 };
  for (const box of gatherCandidates(hit)) {
    const score = scoreContainer(box);
    if (score.count === 0 || (best !== null && !isBetterScore(score, bestScore))) continue;
    best = box;
    bestScore = score;
  }
  if (best !== null && best !== hit) {
    console.info(`[AIMH][triage] inbox-list: bỏ qua hit đầu (container đính kèm) — chọn container có ${bestScore.count} item`);
  }
  return best ?? hit;
}
