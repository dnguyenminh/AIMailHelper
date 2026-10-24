// src/content/owa-adapter/copilot-reply.ts — uat93 (24/10): SOẠN REPLY bằng Copilot (Hướng A
// user chốt). CS dựng prompt (tone/ngôn ngữ/hướng dẫn) → SW gõ vào ô "Message Copilot"
// (trusted click + Input.insertText + Enter — COPIL_REPLY_SUBMIT) → poll exchange mới như
// analyzeViaCopilot → cắt echo prompt còn nháp. KHÔNG tự gửi mail (BR-01) — chèn qua ReplySection.
import { sendMessage } from "../../shared/messaging";
import { filterNewExchange } from "../../shared/copilot-format";
import type { CancelSignal, ReplyLanguage, ReplyTone } from "../../shared/types";
import { freshParts, readCopilotPanel } from "./copilot-bridge";

const POLL_MS = 3000;
const POLL_ROUNDS = 30; // 30×3s = 90s — như analyzeViaCopilot (đo thật 20–70s)
const MIN_DRAFT_CHARS = 40; // ngắn hơn → chưa chắc là thư (có thể chỉ echo/chip)
const MAX_DRAFT_CHARS = 8000; // khớp cap sanitize MdNode (uat60)
const ECHO_MIN = 24; // prompt ≥24 ký tự mới tìm echo — tránh false-positive chuỗi ngắn

export type CopilotReplyOutcome = { ok: true; draft: string } | { ok: false; reason: string };

const TONE_TEXT: Record<ReplyTone, string> = {
  "chinh-thuc": "trang trọng, chuyên nghiệp",
  "than-mat": "thân mật, gần gũi",
  "ngan-gon": "ngắn gọn, súc tích"
};

const LANGUAGE_TEXT: Record<ReplyLanguage, string> = {
  auto: "cùng ngôn ngữ với email nhận được",
  vi: "tiếng Việt",
  en: "tiếng Anh"
};

// Prompt 1 DÒNG (echo dễ khớp nguyên văn khi cắt); extra cap 500 ký tự.
// Copilot panel tự thấy email đang mở — không nhúng nội dung mail vào prompt.
export function buildReplyPrompt(tone: ReplyTone, language: ReplyLanguage, extra?: string): string {
  const parts = [
    "Viết thư trả lời cho email đang mở này.",
    "Giọng điệu: " + (TONE_TEXT[tone] ?? TONE_TEXT["chinh-thuc"]) + ".",
    "Ngôn ngữ: " + (LANGUAGE_TEXT[language] ?? LANGUAGE_TEXT.auto) + "."
  ];
  const tidy = (extra ?? "").trim();
  if (tidy.length > 0) parts.push("Yêu cầu thêm: " + tidy.slice(0, 500));
  parts.push("Chỉ xuất nội dung thư trả lời, không giải thích thêm.");
  return parts.join(" ");
}

// Bỏ nhãn "Copilot said/đã nói" cuối + dọn đầu câu; cap 8000 ký tự.
function cleanMarkers(draft: string): string {
  let out = draft;
  for (const marker of ["copilot said", "copilot đã nói", "copilot đã trả lời"]) {
    const at = out.toLowerCase().lastIndexOf(marker);
    if (at >= 0) out = out.slice(at + marker.length);
  }
  return out.replace(/^[\s:–—-]+/, "").trim().slice(0, MAX_DRAFT_CHARS);
}

// Exchange mới (đã cắt từ "You said" cuối) → bỏ echo prompt → nháp. Khớp nguyên văn giữ
// xuống dòng; hụt thì khớp flat (gập khoảng trắng — mất xuống dòng, chấp nhận fallback).
export function extractDraft(fresh: string, prompt: string): string {
  const exchange = filterNewExchange(fresh).trim();
  const needle = prompt.trim();
  if (needle.length < ECHO_MIN) return cleanMarkers(exchange);
  const flat = (value: string): string => value.replace(/\s+/g, " ");
  const exact = exchange.indexOf(needle);
  if (exact >= 0) return cleanMarkers(exchange.slice(exact + needle.length));
  const flatAt = flat(exchange).indexOf(flat(needle));
  if (flatAt >= 0) return cleanMarkers(flat(exchange).slice(flatAt + flat(needle).length));
  return cleanMarkers(exchange);
}

async function submitPrompt(prompt: string): Promise<{ submitted: boolean; reason?: string }> {
  try {
    return await sendMessage<{ submitted: boolean; reason?: string }>("COPIL_REPLY_SUBMIT", { prompt: prompt });
  } catch (error) {
    return { submitted: false, reason: String(error instanceof Error ? error.message : error).slice(0, 60) };
  }
}

// Nháp có cấu trúc (giữ xuống dòng — outerHTML lượt cuối qua COPIL_PANEL_STRUCTURE);
// ngắn bất thường so với raw → giữ raw (cùng heuristic với withFormat — bài học uat60).
async function structuredDraft(rawFresh: string, prompt: string): Promise<string> {
  const rawDraft = extractDraft(rawFresh, prompt);
  try {
    const read = await sendMessage<{ text?: string }>("COPIL_PANEL_STRUCTURE", {});
    const draft = typeof read.text === "string" ? extractDraft(read.text, prompt) : "";
    if (draft.length >= MIN_DRAFT_CHARS && draft.length * 2 >= rawDraft.length) return draft;
  } catch {
    /* SW bận → giữ raw */
  }
  return rawDraft;
}

// Poll như pollFreshText: fresh (dedupe adjacent + không có baseline) = echo + nháp;
// nháp ổn định 2 vòng liên tiếp → trả. KHÔNG dùng text CŨ khi submit fail (bài học 20/10).
async function pollDraft(prompt: string, baseSet: Set<string>, signal?: CancelSignal): Promise<CopilotReplyOutcome> {
  const cancelled = (): boolean => signal?.cancelled === true;
  let last = "", stable = 0;
  for (let round = 0; round < POLL_ROUNDS; round += 1) {
    if (cancelled()) return { ok: false, reason: "cancelled" };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (cancelled()) return { ok: false, reason: "cancelled" };
    const fresh = freshParts((await readCopilotPanel()).parts, baseSet);
    const draft = extractDraft(fresh, prompt);
    const settled = draft.length >= MIN_DRAFT_CHARS && draft === last;
    stable = settled ? stable + 1 : 0;
    if (stable >= 2) return { ok: true, draft: await structuredDraft(fresh, prompt) };
    last = draft;
  }
  return { ok: false, reason: "no-draft" };
}

// Flow chính: baseline (loại lịch sử chat) → submit prompt → poll nháp.
export async function generateReplyViaCopilot(
  options: { tone: ReplyTone; language: ReplyLanguage; extra?: string },
  signal?: CancelSignal
): Promise<CopilotReplyOutcome> {
  const prompt = buildReplyPrompt(options.tone, options.language, options.extra);
  const baseSet = new Set((await readCopilotPanel()).parts);
  const submitted = await submitPrompt(prompt);
  const audit = submitted.submitted ? "OK" : submitted.reason ?? "?";
  console.log("[AIMH][copilot-reply] submit: " + audit + " | prompt " + prompt.length + " ký tự");
  if (submitted.submitted === false) return { ok: false, reason: submitted.reason ?? "submit-failed" };
  return await pollDraft(prompt, baseSet, signal);
}
