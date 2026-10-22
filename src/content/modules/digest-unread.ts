// src/content/modules/digest-unread.ts — uat80: cập nhật danh sách mail chưa đọc KHÔNG cần
// quét lại toàn bộ. Helpers THUẦN (state in → state out) — digest.ts ủy quyền, dễ test.
// SR-10: không đụng DOM — việc đọc trạng thái row do caller truyền vào dạng callback.
import type { InboxItem } from "../owa-adapter/triage";
import type { DigestEntry, TriageUiState } from "./digest-types";

const TOP_MERGE_MAX = 50; // mỗi lần refreshTop gộp tối đa 50 mail mới (không phình panel)

// ↗ mở mail thành công → mail chuyển "đã đọc" → loại khỏi danh sách ngay.
export function removeEntry(state: TriageUiState, messageId: string): TriageUiState {
  if (state.digest.some((entry) => entry.messageId === messageId) === false) return state;
  return { ...state, digest: state.digest.filter((entry) => entry.messageId !== messageId) };
}

// Mail mới về (top-of-list) → thêm vào digest. Chưa chấm điểm LLM → score 0, reason rỗng
// (hiển thị cuối danh sách; lần "Quét lại" sẽ chấm điểm đầy đủ).
export function mergeNewUnread(state: TriageUiState, top: InboxItem[]): TriageUiState {
  if (top.length === 0) return state;
  const existing = new Set(state.digest.map((entry) => entry.messageId));
  const additions: DigestEntry[] = [];
  for (const item of top) {
    if (existing.has(item.messageId) || additions.some((a) => a.messageId === item.messageId)) continue;
    additions.push({ messageId: item.messageId, subject: item.subject, sender: item.sender, score: 0, reason: "" });
    if (additions.length >= TOP_MERGE_MAX) break;
  }
  if (additions.length === 0) return state;
  return { ...state, digest: [...state.digest, ...additions] };
}

// Mail đã chuyển "đã đọc": chỉ loại khi trạng thái row ĐỌC ĐƯỢC tin cậy. unreadStateOf:
// true = vẫn chưa đọc (giữ) · false = đã đọc (loại) · null = row ảo hóa detach, không kết
// luận được (giữ — lần quét watermark sau sẽ dọn).
export function pruneReadEntries(
  state: TriageUiState,
  unreadStateOf: (messageId: string) => boolean | null
): TriageUiState {
  return { ...state, digest: state.digest.filter((entry) => unreadStateOf(entry.messageId) !== false) };
}
