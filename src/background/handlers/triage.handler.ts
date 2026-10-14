// src/background/handlers/triage.handler.ts — Port kind "triage-batch" (UC-03 bước 3-4; FR-GD5-02).
// 1 LLM call/batch: validate items (BR-15) → prompt triage theo uiLanguage + fence
// serializeTriageItems (§8.11 L2) → adapter.chat temperature 0.2 (GĐ2 DEFAULT_TEMPERATURE.triage,
// retry 429/5xx pre-first-chunk tái dùng call.ts §9.2) → parse fail-closed (§8.11 L3 — TD-8
// reason ≤300) → progress {done,total,failed} + chunk (scores JSON) + done (§6.2 #7).
// Batch-level retry/backoff nằm ở digest.ts (6.6d — MAX_RETRY_BATCH 3) — KHÔNG retry ở đây.
import { AppError } from "../../shared/errors";
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../../shared/llm/types";
import type { ChatMessage, ChatOptions } from "../../shared/llm/types";
import { buildChatMessages, serializeTriageItems } from "../../shared/llm/prompts";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { TRIAGE_CAPS, parseTriageScores } from "../../shared/triage";
import { storage } from "../../shared/storage";
import type { TriageItem } from "../../shared/types";
import { resolveActive } from "../llm-runtime";
import type { ActiveLLM } from "../llm-runtime";
import type { StreamContext, StreamHandler } from "../../shared/port-server";
import { sendError } from "./stream-utils";

export function registerTriageHandlers(server: { register(kind: "triage-batch", handler: StreamHandler): void }): void {
  server.register("triage-batch", handleTriageBatch);
}

const handleTriageBatch: StreamHandler = async (payload, ctx: StreamContext): Promise<void> => {
  let items: TriageItem[];
  let active: ActiveLLM;
  let messages: ChatMessage[];
  try {
    items = parseTriagePayload(payload);
    active = await resolveActive(); // ERR-11 — sender nhận error event
    await ensureHostPermission(active.config); // BR-05
    messages = await buildTriageMessages(items);
  } catch (error) {
    sendError(ctx, error); // ERR-15 / ERR-11 / ERR-14
    return;
  }
  await runTriageBatch(ctx, active, messages, items);
};

// §6.1 — 1 LLM call/batch; kết quả parse SW-side (fail-closed) → progress + chunk + done.
async function runTriageBatch(ctx: StreamContext, active: ActiveLLM, messages: ChatMessage[], items: TriageItem[]): Promise<void> {
  try {
    const response = await active.adapter.chat(active.config, messages, batchOptions(ctx));
    if (ctx.signal.aborted) return; // cancel — không gửi gì thêm (§6.2 #5)
    const scores = parseTriageScores(response.text, new Set(items.map((item) => item.messageId)));
    ctx.send({ type: "progress", done: scores.length, total: items.length, failed: items.length - scores.length });
    ctx.send({ type: "chunk", seq: 0, delta: JSON.stringify(scores) });
    ctx.send({ type: "done", finishReason: response.finishReason, usage: response.usage });
  } catch (error) {
    if (ctx.signal.aborted) return;
    sendError(ctx, error); // ERR-03/16 retryable — digest.ts quyết retry batch (6.6d)
  }
}

const batchOptions = (ctx: StreamContext): ChatOptions => ({
  temperature: DEFAULT_TEMPERATURE.triage, // 0.2 (§4.2 — triage deterministic hơn analyze)
  maxTokens: DEFAULT_MAX_TOKENS,
  signal: ctx.signal
});

// Prompt triage: prompt theo uiLanguage + customSystemPrompt (AF-2 UC-08) + danh sách qua fence.
async function buildTriageMessages(items: TriageItem[]): Promise<ChatMessage[]> {
  const [general, prompts] = await Promise.all([storage.getGeneral(), storage.getPrompts()]);
  return buildChatMessages("triage", general.uiLanguage, serializeTriageItems(items), prompts.customSystemPrompt);
}

// BR-15 — payload: mảng 1..50 item (§7.4 TRIAGE_SCAN_CAP), mỗi item đủ 4 trường non-empty.
export function parseTriagePayload(payload: unknown): TriageItem[] {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const items = raw["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > TRIAGE_CAPS.itemsPerBatch) {
    throw badItems();
  }
  return items.map((item) => {
    const j = (item ?? {}) as Record<string, unknown>;
    if (typeof j["messageId"] !== "string" || j["messageId"].length === 0) throw badItems();
    if (typeof j["subject"] !== "string" || typeof j["sender"] !== "string" || typeof j["snippet"] !== "string") {
      throw badItems();
    }
    return { messageId: j["messageId"], subject: j["subject"], sender: j["sender"], snippet: j["snippet"] };
  });
}

function badItems(): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: "items" });
}
