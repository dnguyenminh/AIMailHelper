// src/background/handlers/stream-utils.ts — vòng lặp stream + error envelope dùng chung các
// stream handler (stream/reply GĐ4). Tách khỏi stream.handler.ts để giữ file ≤ 200 dòng (§1.4 #7).
// Forward ngay từng delta (KHÔNG buffer — §2.5); cancel qua ctx.signal; done/error là message CUỐI.
import { AppError } from "../../shared/errors";
import type { ChatMessage, ChatOptions } from "../../shared/llm/types";
import type { ActiveLLM } from "../llm-runtime";
import type { StreamContext } from "../../shared/port-server";

// Vòng lặp stream dùng chung — forward ngay khi nhận; signal abort → dừng không gửi thêm (§6.2 #5).
export async function streamToClient(ctx: StreamContext, active: ActiveLLM, messages: ChatMessage[], options: ChatOptions): Promise<void> {
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

// Error event qua Port — i18nKey render theo uiLanguage, KHÔNG chứa key/body (BR-08).
export function sendError(ctx: StreamContext, error: unknown): void {
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

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  console.error("[AIMH][stream] unexpected error:", error); // KHÔNG log payload (BR-08)
  return new AppError("ERR-15", "errors.badRequest");
}

function isAppError(error: unknown): error is AppError {
  return error instanceof Error && "code" in error && "i18nKey" in error;
}
