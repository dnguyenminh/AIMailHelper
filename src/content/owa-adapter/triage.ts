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

// FR-GD5-03 — badge màu trên list item. UAT-3 (15/10): TẮT DOM injection — appendChild vào
// row do React của OWA quản lý làm VỠ layout trang (cùng lớp bug toolbar injection — fix 2).
// Điểm số vẫn hiển thị trong panel Digest (DigestView — không đụng DOM OWA). Chiến lược
// overlay shadow-root (không đụng React tree) sẽ thiết kế sau khi spike ổn định.

// UAT-3 — fail-safe: KHÔNG mutate DOM của OWA. Trả false (caller log, không chặn batch).
export function attachBadge(messageId: string, score: number): boolean {
  void messageId;
  void score;
  return false; // spike-pending: badge hiển thị trong Digest panel thay vì trên list row
}


