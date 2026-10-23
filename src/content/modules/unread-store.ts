// src/content/modules/unread-store.ts — uat90: PERSIST danh sách mail chưa đọc vào
// chrome.storage.local. Trước đây kết quả chỉ nằm trong state React → F5/restart là mất,
// user phải quét lại toàn bộ (UX báo 23/10). Reload trang = danh sách vẫn nguyên.
import type { DigestEntry } from "./digest-types";

const KEY = "unread.digest.v1";
const MAX_ENTRIES = 200;

// Đọc danh sách đã lưu; chưa có / lỗi → [] (caller giữ hành vi cũ).
export async function loadUnreadDigest(): Promise<DigestEntry[]> {
  try {
    if (typeof chrome === "undefined" || chrome.storage?.local === undefined) return [];
    const got = await chrome.storage.local.get(KEY);
    const raw = got?.[KEY] as { entries?: DigestEntry[] } | undefined;
    const entries = raw?.entries ?? [];
    return Array.isArray(entries) ? entries.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

// Lưu danh sách (cap 200 entry — quota-safe). Lỗi storage bỏ qua — không chặn luồng chính.
export async function saveUnreadDigest(digest: DigestEntry[]): Promise<void> {
  try {
    if (typeof chrome === "undefined" || chrome.storage?.local === undefined) return;
    if (digest.length === 0) return; // không ghi đè bản đã lưu bằng danh sách rỗng tạm thời
    await chrome.storage.local.set({ [KEY]: { entries: digest.slice(0, MAX_ENTRIES), at: Date.now() } });
  } catch {
    /* quota — bỏ qua */
  }
}
