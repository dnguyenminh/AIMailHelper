// src/shared/llm/base-adapter.ts — Template Method (TDD §4.3): chat/chatStream/testConnection dùng chung,
// mỗi adapter chỉ cài hooks buildRequest/extract*; ctx per-call (concurrency-safe — adapter stateless §3.2).
import { CALL_TIMEOUT, postJson } from "./call";
import { finishReasonError, isMaxTokensUnsupported, modelsNotSupportedError } from "./errmap";
import { parseSse, safeJsonParse } from "./sse";
import type { SseEvent } from "./sse";
import type { ChatMessage, ChatOptions, LLMAdapter, LLMConfig, LLMResponse, ProviderId, TestConnectionResult } from "./types";

export type Json = Record<string, unknown>;
// ctx per-call: OpenAI fallback max_completion_tokens → max_tokens (5.2.1 TA note — Open Issue #11).
export interface CallContext {
  maxTokenField?: "max_completion_tokens" | "max_tokens";
}

export function asRecord(value: unknown): Json {
  return typeof value === "object" && value !== null ? (value as Json) : {};
}
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly id: ProviderId;

  protected abstract buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean, ctx: CallContext): WireRequest;
  protected abstract extractText(payload: Json): string;
  protected abstract extractFinishReason(payload: Json): string | undefined;
  protected abstract extractUsage(payload: Json): { inputTokens: number; outputTokens: number } | undefined;
  protected abstract extractStreamDelta(event: SseEvent, parsed: Json): string;
  protected isStreamEnd(data: string): boolean {
    return data === "[DONE]";
  }

  async chat(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions = {}, ctx: CallContext = {}): Promise<LLMResponse> {
    const request = this.buildRequest(config, messages, opts, false, ctx);
    const response = await postJson(request.url, request.headers, request.body, {
      provider: this.id,
      timeoutMs: opts.timeoutMs ?? CALL_TIMEOUT.chat,
      signal: opts.signal,
      retryDelays: opts.retryDelays
    });
    const payload = asRecord(await response.json());
    const finishReason = this.extractFinishReason(payload);
    const blocked = finishReason !== undefined ? finishReasonError(finishReason) : null;
    if (blocked) throw blocked; // Azure content_filter / Gemini SAFETY — thông báo riêng (5.2.2/5.2.4)
    return {
      text: this.extractText(payload),
      model: config.model,
      finishReason: finishReason,
      usage: this.extractUsage(payload)
    };
  }

  chatStream(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    return this.streamWithFallback(config, messages, opts);
  }

  private async *streamWithFallback(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions): AsyncGenerator<string> {
    const ctx: CallContext = {};
    try {
      yield* this.rawStream(config, messages, opts, ctx);
    } catch (error) {
      if (!this.canFallback(ctx, error)) throw error;
      yield* this.rawStream(config, messages, opts, ctx); // max_tokens fallback — pre-first-chunk
    }
  }

  private canFallback(ctx: CallContext, error: unknown): boolean {
    return ctx.maxTokenField === "max_completion_tokens" && isMaxTokensUnsupported(error);
  }

  protected async *rawStream(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, ctx: CallContext): AsyncGenerator<string> {
    const request = this.buildRequest(config, messages, opts, true, ctx);
    const response = await postJson(request.url, request.headers, request.body, {
      provider: this.id,
      signal: opts.signal,
      retryDelays: opts.retryDelays
    });
    for await (const event of parseSse(response)) {
      if (opts.signal?.aborted) return; // cancel — ngừng im lặng (§6.2 #5)
      if (this.isStreamEnd(event.data)) return;
      const delta = this.extractStreamDelta(event, asRecord(safeJsonParse(event.data)));
      if (delta.length > 0) yield delta;
    }
  }

  // Mặc định: provider không hỗ trợ listModels (Azure — BR-17) → adapter khác override.
  async listModels(_config: LLMConfig): Promise<string[]> {
    throw modelsNotSupportedError();
  }

  // testConnection = chat ping nhỏ; timeout 15s hard (§6.1 #4); lỗi → AppError propagates (error envelope).
  async testConnection(config: LLMConfig): Promise<TestConnectionResult> {
    const start = Date.now();
    await this.chat(config, [{ role: "user", content: "ping" }], {
      temperature: 0,
      maxTokens: 16,
      timeoutMs: CALL_TIMEOUT.testConnection
    });
    return { ok: true, message: "OK", latencyMs: Date.now() - start };
  }
}

export interface WireRequest {
  url: string;
  headers: Record<string, string>;
  body: Json;
}
