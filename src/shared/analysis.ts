// src/shared/analysis.ts — validate/parse cho luồng analyze (GĐ3; TDD §8.11 L3 + §8.8 + FSD 6.6f).
// Pure util ở shared (§4.5): SW dùng parseEmailPayload (BR-14 defense-in-depth), panel dùng
// toAnalysisResult (EF-6 fail-closed). KHÔNG eval/execute chuỗi LLM (BR-16 — audit test).
import { AppError } from "./errors";
import type { AnalysisResult, EmailData } from "./types";

// §8.11 L3 — cap chống output phình bất thường. Vi phạm → REJECT (EF-6), không âm thầm sửa (BR-15).
export const ANALYSIS_CAPS = {
  text: 1000, // summary / intent / sentiment
  actionCount: 10,
  actionLength: 200
} as const;

type Unknown = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";
const within = (s: string, max: number): boolean => s.length <= max;

// Đủ 7 field + score 0..100 (integer) → AnalysisResult; sai → throw (EF-6 phía caller).
export function validateAnalysisResult(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw schemaError();
  const j = raw as Unknown;
  const score = j["importanceScore"];
  if (!isStr(j["summary"]) || !isStr(j["intent"]) || !isStr(j["sentiment"])) throw schemaError();
  if (!Array.isArray(j["actions"])) throw schemaError();
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) throw schemaError();
  const actions = j["actions"].map((a) => {
    if (!isStr(a) || !within(a, ANALYSIS_CAPS.actionLength)) throw schemaError();
    return a;
  });
  if (actions.length > ANALYSIS_CAPS.actionCount) throw schemaError();
  if (!within(j["summary"], ANALYSIS_CAPS.text) || !within(j["intent"], ANALYSIS_CAPS.text) || !within(j["sentiment"], ANALYSIS_CAPS.text)) {
    throw schemaError();
  }
  const deadline = j["deadline"];
  if (deadline !== null && !isIsoDate(deadline)) throw schemaError();
  return {
    summary: j["summary"],
    importanceScore: score,
    importanceLabel: importanceLabelOf(score),
    intent: j["intent"],
    actions: actions,
    deadline: deadline as string | null,
    sentiment: j["sentiment"]
  };
}

// §7.2 — suy label từ score: >=70 cao, >=40 trung-binh, <40 thap.
export function importanceLabelOf(score: number): AnalysisResult["importanceLabel"] {
  if (score >= 70) return "cao";
  return score >= 40 ? "trung-binh" : "thap";
}

function isIsoDate(v: unknown): v is string {
  return isStr(v) && !Number.isNaN(Date.parse(v));
}

function schemaError(): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: "analysisResult" });
}

// FSD 6.6f — cắt khối { ... } đầu tiên hợp lệ (đếm ngoặc tôn trọng chuỗi), JSON.parse + validate.
export function extractJsonBlock(raw: string): string | null {
  const start = raw.indexOf("{");
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
    else if (ch === "{") depth += 1;
    else if (ch === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

// EF-6: parse fail-closed — không parse được → null (caller hiển thị raw + cảnh báo, không tự retry).
export function toAnalysisResult(raw: string): AnalysisResult | null {
  try {
    const block = extractJsonBlock(raw);
    if (block === null) return null;
    return validateAnalysisResult(JSON.parse(block));
  } catch {
    return null;
  }
}

// §6.2/§8.8 — validate payload EmailData từ Port; bodyText rỗng → ERR-10 (BR-14, chặn trước LLM).
export function parseEmailPayload(raw: unknown): EmailData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badEmail();
  const j = raw as Unknown;
  const sender = parsePerson(j["sender"]);
  if (!isStr(j["messageId"]) || !isStr(j["subject"]) || !sender) throw badEmail();
  if (!isStr(j["bodyText"]) || j["bodyText"].trim().length === 0) {
    throw new AppError("ERR-10", "errors.emptyEmail"); // BR-14
  }
  if (j["detectedView"] !== "reading-pane" && j["detectedView"] !== "popout" && j["detectedView"] !== "conversation") {
    throw badEmail();
  }
  return {
    messageId: j["messageId"],
    subject: j["subject"],
    sender: sender,
    to: parsePersonList(j["to"]),
    cc: parsePersonList(j["cc"]),
    bodyText: j["bodyText"],
    threadContext: parseThread(j["threadContext"]),
    detectedView: j["detectedView"]
  };
}

function parsePersonList(raw: unknown): { name: string; email: string }[] {
  if (!Array.isArray(raw)) throw badEmail();
  return raw.map((item) => {
    const person = parsePerson(item);
    if (!person) throw badEmail();
    return person;
  });
}

function parseThread(raw: unknown): EmailData["threadContext"] {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw badEmail();
  return raw.map((item) => {
    const j = (item ?? {}) as Unknown;
    if (!isStr(j["subject"]) || !isStr(j["from"]) || !isStr(j["excerpt"])) throw badEmail();
    return { subject: j["subject"], from: j["from"], excerpt: j["excerpt"] };
  });
}

function parsePerson(raw: unknown): { name: string; email: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Unknown;
  if (!isStr(j["name"]) || !isStr(j["email"])) return null;
  return { name: j["name"], email: j["email"] };
}

function badEmail(): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: "email" });
}
