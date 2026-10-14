// src/content/owa-adapter/triage-cache.ts — cache.triage.{messageId} (TDD §6.3; BR-07/BR-09; #10).
// storage.local qua cache-store (Repository client §4.4); ghi GỘP batch — 1 lần set/vòng quét
// (§3.3, FSD 5.4.1 TA note); LRU 500 entry — evict analyzedAt cũ nhất (§7.4); entry hỏng → dọn
// ngay (§6.3.2 EF-3 UC-04 — migration được phép drop cache).
import { getCacheAll, removeCache, setCacheMany } from "../../shared/cache-store";
import type { TriageScore } from "../../shared/types";

const KEY_PREFIX = "cache.triage.";
export const TRIAGE_CACHE_LRU = 500; // §7.4 (#10 — ~100KB, an toàn trong local 10MB)

const keyOf = (messageId: string): string => KEY_PREFIX + messageId;

// Validator — shape sai (devtools/migration cũ) → null (entry bị dọn, không âm thầm sửa — BR-15).
function validateScore(value: unknown): TriageScore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Partial<TriageScore>;
  if (typeof entry.messageId !== "string" || typeof entry.reason !== "string") return null;
  if (typeof entry.score !== "number" || !Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100) return null;
  if (typeof entry.analyzedAt !== "string") return null;
  return entry as TriageScore;
}

// BR-09 — lấy kết quả đã cache cho các id (MỘT lần đọc storage; entry hỏng bỏ qua).
export async function getTriageMany(messageIds: readonly string[]): Promise<Map<string, TriageScore>> {
  const all = await getCacheAll(KEY_PREFIX);
  const result = new Map<string, TriageScore>();
  for (const id of messageIds) {
    const score = validateScore(all[keyOf(id)]);
    if (score !== null) result.set(id, score);
  }
  return result;
}

// Ghi GỘP batch (1 lần set/vòng quét — §3.3) + evict LRU nếu vượt cap 500.
export async function setTriageMany(scores: readonly TriageScore[]): Promise<void> {
  if (scores.length === 0) return;
  const items: Record<string, unknown> = {};
  for (const score of scores) items[keyOf(score.messageId)] = score;
  await setCacheMany(items);
  await evictTriageOverflow();
}

// §7.4 — cap 500: vượt → evict analyzedAt cũ nhất (LRU theo freshness); entry hỏng → dọn.
export async function evictTriageOverflow(cap: number = TRIAGE_CACHE_LRU): Promise<number> {
  const all = await getCacheAll(KEY_PREFIX);
  const entries: { key: string; analyzedAt: string }[] = [];
  for (const [key, value] of Object.entries(all)) {
    const score = validateScore(value);
    if (score === null) {
      await removeCache(key);
      continue;
    }
    entries.push({ key: key, analyzedAt: score.analyzedAt });
  }
  if (entries.length <= cap) return 0;
  entries.sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt));
  const excess = entries.slice(0, entries.length - cap);
  for (const entry of excess) await removeCache(entry.key);
  return excess.length;
}

// UC-04 bước 2 — đọc toàn bộ cache triage (Digest join với item ĐANG hiển thị — AF-3 UC-04:
// item mồ côi không join nhưng vẫn nằm trong cache chờ LRU evict).
export async function loadAllTriage(): Promise<Map<string, TriageScore>> {
  const all = await getCacheAll(KEY_PREFIX);
  const result = new Map<string, TriageScore>();
  for (const [key, value] of Object.entries(all)) {
    const score = validateScore(value);
    if (score === null) {
      void removeCache(key); // entry hỏng → dọn, không chặn Digest (EF-2 UC-04)
      continue;
    }
    result.set(score.messageId, score);
  }
  return result;
}
