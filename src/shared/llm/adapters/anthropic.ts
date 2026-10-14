// src/shared/llm/adapters/anthropic.ts — Anthropic Messages API (FSD 5.2.3).
// Transformation bắt buộc: system → top-level; message đầu phải user; max_tokens REQUIRED (default 2048 — #11).
// 4 headers (thiếu CORS header → ERR-01); SSE event content_block_delta; event error 529 → ERR-16;
// listModels /v1/models phân trang has_more/after_id — CORS chưa verify (spike GĐ2 — Open Issue #2, ghi chú).
import { CALL_TIMEOUT, getJson } from "../call";
import { asArray, asNumber, asRecord, asText, BaseLLMAdapter } from "../base-adapter";
import type { Json, WireRequest } from "../base-adapter";
import { AppError } from "../../errors";
import type { ChatMessage, ChatOptions, LLMConfig } from "../types";
import type { SseEvent } from "../sse";
import { applyAnthropicImage } from "../vision-wire";

const API_ROOT = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10; // TD-2: server lặp has_more=true cùng trang → KHÔNG loop vô hạn

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly id = "anthropic" as const;

  protected buildHeaders(config: LLMConfig): Record<string, string> {
    return {
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true", // bắt buộc gọi trực tiếp từ browser (5.2.3)
      "Content-Type": "application/json"
    };
  }

  protected buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): WireRequest {
    const body: Json = {
      model: config.model,
      max_tokens: opts.maxTokens ?? 2048, // BẮT BUỘC — #11
      ...transformMessages(messages),
      stream: stream
    };
    if (opts.visionImage) applyAnthropicImage(body, opts.visionImage); // GĐ4 T3 — gated additive
    return { url: API_ROOT + "/messages", headers: this.buildHeaders(config), body: body };
  }

  protected extractText(payload: Json): string {
    return asArray(payload["content"])
      .map((block) => (asRecord(block)["type"] === "text" ? asText(asRecord(block)["text"]) : ""))
      .join("");
  }

  protected extractFinishReason(payload: Json): string | undefined {
    const stop = asText(payload["stop_reason"]);
    if (stop.length === 0) return undefined;
    return stop === "end_turn" ? "stop" : stop; // NORMALIZE end_turn→stop (§4.2)
  }

  protected extractUsage(payload: Json): { inputTokens: number; outputTokens: number } | undefined {
    const usage = asRecord(payload["usage"]);
    const input = asNumber(usage["input_tokens"]);
    const output = asNumber(usage["output_tokens"]);
    return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : undefined;
  }

  protected extractStreamDelta(event: SseEvent, parsed: Json): string {
    if (event.event === "error") throw overloadedError(parsed); // event error giữa stream → 529/ERR-16
    if (event.event !== "content_block_delta") return ""; // ping/message_start/message_delta… bỏ qua
    const delta = asRecord(parsed["delta"]);
    return delta["type"] === "text_delta" ? asText(delta["text"]) : "";
  }

  // GET /v1/models?limit=100 — phân trang has_more → after_id (5.2.3); cap 10 trang (TD-2). ⚠ CORS spike chưa verify.
  override async listModels(config: LLMConfig): Promise<string[]> {
    const models: string[] = [];
    let afterId: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = API_ROOT + "/models?limit=" + PAGE_LIMIT + (afterId !== null ? "&after_id=" + encodeURIComponent(afterId) : "");
      const response = await getJson(url, this.buildHeaders(config), { provider: this.id, timeoutMs: CALL_TIMEOUT.listModels });
      const payload = asRecord(await response.json());
      for (const item of asArray(payload["data"])) {
        const id = asText(asRecord(item)["id"]);
        if (id.length > 0) models.push(id);
      }
      if (payload["has_more"] !== true || models.length === 0) break;
      afterId = models[models.length - 1] ?? null;
    }
    return models;
  }
}

// 5.2.3 #1-2: system gộp top-level; messages chỉ user/assistant; đầu tiên phải user.
function transformMessages(messages: ChatMessage[]): { system?: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const result: { system?: string; messages: { role: "user" | "assistant"; content: string }[] } = {
    messages: rest.length > 0 && rest[0]?.role === "user" ? mergeConsecutive(rest) : [{ role: "user", content: mergeAll(messages) }]
  };
  if (systemParts.length > 0) result.system = systemParts.join("\n\n");
  return result;
}

function mergeConsecutive(items: { role: "user" | "assistant"; content: string }[]): { role: "user" | "assistant"; content: string }[] {
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) last.content += "\n\n" + item.content;
    else merged.push({ ...item });
  }
  return merged;
}

function mergeAll(messages: ChatMessage[]): string {
  return messages.map((m) => m.content).join("\n\n");
}

function overloadedError(parsed: Json): AppError {
  const type = asText(asRecord(parsed["error"])["type"]);
  const isOverloaded = type === "overloaded_error";
  return new AppError(isOverloaded ? "ERR-16" : "ERR-15", isOverloaded ? "errors.providerOverloaded" : "errors.badRequest", undefined, isOverloaded, isOverloaded ? 529 : undefined);
}
