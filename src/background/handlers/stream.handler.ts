// src/background/handlers/stream.handler.ts — stream handlers qua Port (TDD §6.2; GĐ2 chat-test, GĐ3 analyze).
// analyze: validate EmailData (BR-14 bodyText rỗng → ERR-10 ở SW nữa — §8.8) → buildChatMessages
// ("analyze", uiLanguage, serializeEmailData fence — SR-01 L2) → chatStream → forward từng delta
// (KHÔNG buffer — §2.5); cancel qua PortServer AbortController (ctx.signal); done/error message CUỐI.
import { parseEmailPayload } from "../../shared/analysis";
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../../shared/llm/types";
import type { ChatMessage, ChatOptions } from "../../shared/llm/types";
import { buildChatMessages, serializeEmailData } from "../../shared/llm/prompts";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { storage } from "../../shared/storage";
import { resolveActive } from "../llm-runtime";
import { AppError } from "../../shared/errors";
import type { EmailData } from "../../shared/types";
import type { ActiveLLM } from "../llm-runtime";
import type { StreamContext, StreamHandler } from "../../shared/port-server";

const CHAT_TEST_TEMPERATURE = 0.7;

export function registerStreamHandlers(server: {
  register(kind: "chat-test" | "analyze", handler: StreamHandler): void;
}): void {
  server.register("chat-test", handleChatTest);
  server.register("analyze", handleAnalyze);
}

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) throw badMessages();
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    const record = (item ?? {}) as Record<string, unknown>;
    const role = record["role"];
    const content = record["content"];
    if ((role !== "system" && role !== "user" && role !== "assistant") || typeof content !== "string" || content.length === 0) {
      throw badMessages();
    }
    messages.push({ role: role, content: content });
  }
  if (messages.length === 0) throw badMessages();
  return messages;
}

function badMessages(): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: "messages" });
}

const handleChatTest: StreamHandler = async (payload, ctx: StreamContext): Promise<void> => {
  let messages: ChatMessage[];
  let active: ActiveLLM;
  try {
    messages = parseMessages((payload as { messages?: unknown } | null)?.messages);
    active = await resolveActive(); // ERR-11 nếu chưa cấu hình — sender nhận error event
    await ensureHostPermission(active.config); // BR-05
  } catch (error) {
    sendError(ctx, error);
    return;
  }
  const options: ChatOptions = { temperature: CHAT_TEST_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS };
  await streamToClient(ctx, active, messages, options);
};

// UC-01 step 3-5 — analyze qua Port: prompt analyze theo uiLanguage + customSystemPrompt (AF-2 UC-08).
const handleAnalyze: StreamHandler = async (payload, ctx: StreamContext): Promise<void> => {
  let email: EmailData;
  let active: ActiveLLM;
  try {
    email = parseEmailPayload((payload as { email?: unknown } | null)?.email);
    active = await resolveActive();
    await ensureHostPermission(active.config);
  } catch (error) {
    sendError(ctx, error); // ERR-10 (BR-14) / ERR-11 / ERR-14 / ERR-15
    return;
  }
  const messages = await buildAnalyzeMessages(email);
  const options: ChatOptions = { temperature: DEFAULT_TEMPERATURE.analyze, maxTokens: DEFAULT_MAX_TOKENS };
  await streamToClient(ctx, active, messages, options);
};

// Prompt analyze: serializeEmailData (fence EMAIL_OPEN/CLOSE + neutralize — §8.11 L2, tái dùng GĐ2).
async function buildAnalyzeMessages(email: EmailData): Promise<ChatMessage[]> {
  const [general, prompts] = await Promise.all([storage.getGeneral(), storage.getPrompts()]);
  return buildChatMessages("analyze", general.uiLanguage, serializeEmailData(email), prompts.customSystemPrompt);
}

// Vòng lặp stream dùng chung — forward ngay khi nhận; signal abort → dừng không gửi thêm (§6.2 #5).
async function streamToClient(ctx: StreamContext, active: ActiveLLM, messages: ChatMessage[], options: ChatOptions): Promise<void> {
  let seq = 0;
  try {
    for await (const delta of active.adapter.chatStream(active.config, messages, { ...options, signal: ctx.signal })) {
      if (ctx.signal.aborted) return;
      ctx.send({ type: "chunk", seq: seq, delta: delta });
      seq += 1;
    }
    ctx.send({ type: "done" }); // usage/finishReason chỉ khi provider trả — stream chỉ yield text (§5.3.2 #4)
  } catch (error) {
    if (ctx.signal.aborted) return;
    sendError(ctx, error);
  }
}

function sendError(ctx: StreamContext, error: unknown): void {
  const appError = toAppError(error);
  ctx.send({
    type: "error",
    code: appError.code,
    i18nKey: appError.i18nKey,
    params: appError.params,
    retryable: appError.retryable,
    httpStatus: appError.httpStatus
  });
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  console.error("[AIMH][stream] unexpected error:", error); // KHÔNG log payload (BR-08)
  return new AppError("ERR-15", "errors.badRequest");
}

function isAppError(error: unknown): error is AppError {
  return error instanceof Error && "code" in error && "i18nKey" in error;
}
