// src/content/owa-adapter/triage.ts — quét inbox ĐANG HIỂN THỊ (TDD §3.1.6; BR-07; FR-GD5-01).
// KHÔNG tải thêm mail ngoài list hiển thị (BR-07): duyệt inbox-item hiện hữu trong DOM
// (virtualized list — chỉ item trong DOM, AF-5 UC-03). message-id chain S1→S2→S3 (§7.5);
// thiếu → ERR-12 log + bỏ qua (FR-GD5-06 — không gián đoạn batch). Badge inject QUA adapter
// (SR-10 createElement/textContent, không innerHTML) — components không tự đụng DOM OWA (§1.4 #2).
import { AppError } from "../../shared/errors";
import type { TriageItem } from "../../shared/types";
import { resolveMessageId } from "./message-id";
import { normalizeBody, parsePerson } from "./reader";
import type { FunctionKey } from "./selectors";
import { SELECTOR_CHAINS } from "./selectors";

export type LocateFn = (functionKey: FunctionKey, question: string) => Promise<Element | null>;

export interface InboxItem extends TriageItem {
  provenance: "native" | "synthetic"; // §7.5 — synthetic ghi kèm để quét lại có thể thay id thật
}

const SUBJECT_PROBE = '[role="heading"], h1, h2';
const FROM_PATTERN = /^(From|Từ)\b/i;
const PREVIEW_CHARS = 160;
const BADGE_CLASS = "aimh-triage-badge";

// Scan hiện tại — badge lookup theo messageId CHỈ trong lần quét này (không cache DOM element
// qua phiên — §3.1.6); clear đầu mỗi lần quét.
const currentScan = new Map<string, Element>();

// UC-03 bước 2 — thu thập {messageId, subject, sender, snippet} từng item ĐANG HIỂN THỊ (BR-07).
export async function collectInboxItems(locate: LocateFn): Promise<InboxItem[]> {
  const list = await locate("inbox-list", "danh sách email inbox đang hiển thị");
  if (!list) throw new AppError("ERR-06", "errors.owaNotFound"); // ERR-06 — panel gợi ý Diagnose
  currentScan.clear();
  const items: InboxItem[] = [];
  for (const element of list.querySelectorAll(SELECTOR_CHAINS["inbox-item"].join(","))) {
    const item = await readItem(element);
    if (item === null) continue; // ERR-12 — đã log, batch không gián đoạn (FR-GD5-06)
    currentScan.set(item.messageId, element);
    items.push(item);
  }
  return items;
}

// Đọc 1 list item: subject (heading probe) + sender (aria-label From/Từ) + preview (textContent
// normalize — SR-10) → messageId chain §7.5. Không đủ dữ liệu → null (caller bỏ qua + log).
async function readItem(element: Element): Promise<InboxItem | null> {
  const subject = element.querySelector(SUBJECT_PROBE)?.textContent?.trim() ?? "";
  const senderRaw = firstLabeled(element, FROM_PATTERN);
  const sender = parsePerson(senderRaw) ?? { name: "", email: "" };
  const preview = normalizeBody(element.textContent ?? "").slice(0, PREVIEW_CHARS);
  const id = await resolveMessageId(element, subject, sender.email, preview);
  if (id === null) {
    console.warn("[AIMH][triage] ERR-12: item thiếu message-id — bỏ qua (FR-GD5-06)");
    return null;
  }
  return {
    messageId: id.messageId,
    provenance: id.provenance,
    subject: subject,
    sender: sender.email.length > 0
      ? (sender.name.length > 0 ? sender.name + " <" + sender.email + ">" : sender.email)
      : senderRaw,
    snippet: preview
  };
}

// Header row qua aria-label prefix (EN/VN) — structural attribute, không đoán theo text (§3.1.4).
function firstLabeled(container: Element, pattern: RegExp): string {
  for (const el of container.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") ?? "";
    if (pattern.test(label)) {
      const sep = label.indexOf(":");
      return (sep >= 0 ? label.slice(sep + 1) : label.replace(/^\S+\s*/, "")).trim();
    }
  }
  return "";
}

// EF-2/EF-4 UC-03 — folder signature lightweight: identity container list (đổi folder → container
// mới). digest.ts check TRƯỚC MỖI batch (TDD §3.1.6). Hạn chế container-reuse ghi ở OWA-DOM-SPIKE #44.
export async function readFolderSignature(locate: LocateFn): Promise<Element | null> {
  return locate("inbox-list", "danh sách inbox hiện tại");
}

export async function hasFolderChanged(before: Element | null, locate: LocateFn): Promise<boolean> {
  if (before === null) return false; // scan bắt đầu không thấy list → không có mốc để so
  if (!before.isConnected) return true; // container bị tháo khỏi DOM → folder đã đổi
  const current = await locate("inbox-list", "danh sách inbox hiện tại");
  return current === null || current !== before;
}

// FR-GD5-03 — badge màu trên list item (createElement/textContent — SR-10). Màu theo score
// (FSD UI spec): đỏ ≥70 / cam 40-69 / xanh <40 — khớp badge palette DESIGN-SYSTEM (§3.6).
// Item không còn trong lần quét hiện tại (re-render/virtualized) → false; quét lại gắn lại badge.
export function attachBadge(messageId: string, score: number): boolean {
  const item = currentScan.get(messageId);
  if (!item) return false;
  removeBadge(item); // quét lại → thay badge cũ
  const badge = document.createElement("span"); // SR-10 — DOM API an toàn
  badge.className = BADGE_CLASS;
  badge.textContent = String(score); // SR-10 — textContent, không innerHTML
  badge.setAttribute("aria-label", "Mức độ quan trọng: " + score + "/100");
  badge.style.cssText = badgeStyle(score);
  item.appendChild(badge);
  return true;
}

function badgeStyle(score: number): string {
  const background = score >= 70 ? "#a4262c" : score >= 40 ? "#8a6116" : "#107c10";
  return "display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;font-size:11px;" +
    "font-weight:600;line-height:16px;color:#fff;background:" + background + ";";
}

function removeBadge(item: Element): void {
  for (const old of item.querySelectorAll("." + BADGE_CLASS)) old.remove();
}
