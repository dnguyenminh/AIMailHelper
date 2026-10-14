// src/background/handlers/stream.handler.ts — stream handlers qua Port (TDD §6.2; GĐ2: kind "chat-test").
// chat-test: resolve provider active → adapter.chatStream → forward từng delta (KHÔNG buffer — §2.5);
// cancel qua PortServer AbortController (ctx.signal); done/error là message CUỐI (§6.2 #3).
// kinds analyze/reply/triage-batch cài ở GĐ3/GĐ5 — chưa đăng ký → PortServer trả notImplemented.
import { DEFAULT_MAX_TOKENS } from "../../shared/llm/types";
import type { ChatMessage, ChatOptions } from "../../shared/llm/types";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { resolveActive } from "../llm-runtime";
import { AppError } from "../../shared/errors";
import type { StreamContext, StreamHandler } from "../../shared/port-server";

const CHAT_TEST_TEMPERATURE = 0.7;

export function registerStreamHandlers(server: { register(kind: "chat-test", handler: StreamHandler): void }): void {
  server.register("chat-test", handleChatTest);
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
  let adapter: Awaited<ReturnType<typeof resolveActive>>;
  try {
    messages = parseMessages((payload as { messages?: unknown } | null)?.messages);
    adapter = await resolveActive(); // ERR-11 nếu chưa cấu hình — sender nhận error event
    await ensureHostPermission(adapter.config); // BR-05
  } catch (error) {
    sendError(ctx, error);
    return;
  }
  const options: ChatOptions = {
    temperature: CHAT_TEST_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    signal: ctx.signal
  };
  let seq = 0;
  try {
    for await (const delta of adapter.adapter.chatStream(adapter.config, messages, options)) {
      if (ctx.signal.aborted) return; // §6.2 #5 — sau cancel không gửi gì thêm
      ctx.send({ type: "chunk", seq: seq, delta: delta });
      seq += 1;
    }
    ctx.send({ type: "done" }); // usage/finishReason chỉ khi provider trả — stream chỉ yield text (§5.3.2 #4)
  } catch (error) {
    if (ctx.signal.aborted) return;
    sendError(ctx, error);
  }
};

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
