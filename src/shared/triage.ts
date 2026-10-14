// src/shared/triage.ts — validate/parse triage (GĐ5; TDD §8.11 L3 + §7.2; FSD 6.6d).
// Pure util ở shared (§4.5): SW dùng parseTriageScores (fail-closed trước khi gửi về CS),
// digest-batch dùng lại khi nhận chunk. KHÔNG eval/execute chuỗi LLM (BR-16 — audit test).
import type { TriageScore } from "./types";

// §8.11 L3 — cap chống output phình bất thường. Vi phạm → REJECT (item "chưa chấm"),
// KHÔNG âm thầm sửa (BR-15). TD-8 (TA review): reason cap 300 BẮT BUỘC ở GĐ5.
export const TRIAGE_CAPS = {
  reason: 300, // TriageScore.reason ≤ 300 ký tự (TD-8 — M-1 bảng lớp 3 §8.11)
  itemsPerBatch: 50 // payload guard — ≤ TRIAGE_SCAN_CAP (§7.4)
} as const;

type Unknown = Record<string, unknown>;
const isStr = (v: unknown): v is string => typeof v === "string";

// Parse 1 TriageScore — fail-closed: null khi sai shape / score / reason / messageId lạ
// (id không thuộc batch gửi đi = LLM hallucinate → bỏ qua, KHÔNG cache).
export function parseTriageScore(raw: unknown, expectedIds: ReadonlySet<string>): TriageScore | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const j = raw as Unknown;
  const score = j["score"];
  if (!isStr(j["messageId"]) || !isStr(j["reason"])) return null;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) return null;
  if (j["reason"].length > TRIAGE_CAPS.reason) return null; // TD-8 — vượt cap → REJECT (EF-6)
  if (!expectedIds.has(j["messageId"])) return null; // id lạ → không thuộc batch này
  return {
    messageId: j["messageId"],
    score: score,
    reason: j["reason"],
    analyzedAt: new Date().toISOString() // §7.2 — freshness + LRU evict
  };
}

// FSD 6.6d — parse mảng TriageScore từ raw LLM; phần tử sai → bỏ qua (item "chưa chấm",
// FR-GD5-06 — KHÔNG gián đoạn batch). Raw không chứa mảng hợp lệ → [] (batch coi như fail).
export function parseTriageScores(raw: string, expectedIds: ReadonlySet<string>): TriageScore[] {
  const block = extractJsonArrayBlock(raw);
  if (block === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const scores: TriageScore[] = [];
  for (const item of parsed) {
    const score = parseTriageScore(item, expectedIds);
    if (score !== null) scores.push(score);
  }
  return scores;
}

// Tương tự extractJsonBlock (analysis.ts — 6.6f) nhưng cho mảng [...] — đếm ngoặc tôn trọng chuỗi.
export function extractJsonArrayBlock(raw: string): string | null {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]" && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}
