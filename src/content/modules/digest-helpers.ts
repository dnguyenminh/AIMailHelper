// src/content/modules/digest-helpers.ts — pure helpers cho TriageController (TDD §3.7 GĐ5).
// Tách khỏi digest.ts để giữ file ≤ 200 dòng (§1.4 #7) — KHÔNG side-effect, dễ test (§4.5).
import type { TriageScore } from "../../shared/types";
import type { InboxItem } from "../owa-adapter/triage";
import type { DigestEntry, TriageError, TriageProgress } from "./digest";

// Chia mảng thành các batch cỡ `size` (6.6d — chunks(todo, batchSize)).
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    result.push(items.slice(i, i + Math.max(1, size)));
  }
  return result;
}

export const idsOf = (items: readonly InboxItem[]): string[] => items.map((item) => item.messageId);

// UC-04 bước 2-3 — Digest từ cache (AF-1: badge + Digest vẫn cập nhật); rỗng → EF-1 (UI hint).
export function entriesFromCached(items: readonly InboxItem[], cached: ReadonlyMap<string, TriageScore>): DigestEntry[] {
  const entries: DigestEntry[] = [];
  for (const item of items) {
    const score = cached.get(item.messageId);
    if (score !== undefined) entries.push(toEntry(item, score));
  }
  return sortByScore(entries); // FR-GD5-04 — sort score giảm dần
}

// Gộp kết quả batch mới vào Digest + sort lại (FR-GD5-04) — cập nhật dần (AF-1 UC-04).
export function upsertDigest(digest: DigestEntry[], score: TriageScore, visible: readonly InboxItem[]): void {
  const item = visible.find((candidate) => candidate.messageId === score.messageId);
  const entry = toEntry(item ?? { messageId: score.messageId, subject: "", sender: "", snippet: "", provenance: "native" }, score);
  const index = digest.findIndex((candidate) => candidate.messageId === score.messageId);
  if (index >= 0) digest[index] = entry;
  else digest.push(entry);
  digest.sort((a, b) => b.score - a.score);
}

export const sortByScore = (entries: DigestEntry[]): DigestEntry[] =>
  [...entries].sort((a, b) => b.score - a.score); // FR-GD5-04

function toEntry(item: InboxItem, score: TriageScore): DigestEntry {
  return { messageId: score.messageId, subject: item.subject, sender: item.sender, score: score.score, reason: score.reason, ariaKey: item.ariaKey };
}

// AppError / unknown → TriageError (i18nKey render theo uiLanguage — BR-08, KHÔNG chứa key/body).
export function toTriageError(error: unknown): TriageError {
  if (error instanceof Error && "code" in error && "i18nKey" in error) {
    const appError = error as unknown as { code: string; i18nKey: string; params?: Record<string, string> };
    return { code: appError.code, i18nKey: appError.i18nKey, params: appError.params };
  }
  console.error("[AIMH][digest] unexpected error:", error); // KHÔNG log payload (BR-08)
  return { code: "ERR-15", i18nKey: "errors.badRequest" };
}

// Progress aggregator — {done, total, failed} tính phía CS (batch-level progress từ SW
// chỉ mang số per-batch — §6.2 #7; digest cộng dồn theo kết quả parse thật).
export const progressOf = (done: number, total: number, failed: number): TriageProgress =>
  ({ done: done, total: total, failed: failed });
