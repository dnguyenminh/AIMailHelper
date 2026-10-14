// src/shared/llm/adapters/openai-compatible.ts — OpenRouter/vLLM/proxy (FSD 5.2.5) + base cho local (5.2.6).
// Tolerant: connection close = end (không cần [DONE]); dòng JSON hỏng bỏ qua; apiKey optional
// (KHÔNG gửi Authorization rỗng — một số server trả 401 khi thấy header rỗng).
import { CALL_TIMEOUT, getJson } from "../call";
import { asArray, asRecord, asText, BaseLLMAdapter } from "../base-adapter";
import type { Json, WireRequest } from "../base-adapter";
import { AppError } from "../../errors";
import type { ChatMessage, ChatOptions, LLMConfig, ProviderId } from "../types";
import type { SseEvent } from "../sse";
import { requiredKey } from "./openai";
import { applyOpenAIImage } from "../vision-wire";

export class OpenAICompatibleAdapter extends BaseLLMAdapter {
  readonly id: ProviderId = "openai-compatible";

  protected chatUrl(config: LLMConfig): string {
    return trimSlash(requireBaseUrl(config)) + "/chat/completions";
  }

  protected buildHeaders(config: LLMConfig): Record<string, string> {
    // Chỉ gửi Authorization khi apiKey khác rỗng (5.2.5 headers table)
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (requiredKey(config).length > 0) headers["Authorization"] = "Bearer " + requiredKey(config);
    return headers;
  }

  protected buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): WireRequest {
    const body: Json = {
      model: config.model,
      messages: messages,
      stream: stream,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2048
    };
    if (opts.visionImage) applyOpenAIImage(body, opts.visionImage); // GĐ4 T3 — gated additive (vision-wire)
    return {
      url: this.chatUrl(config),
      headers: this.buildHeaders(config),
      // 5.2.5: body giống OpenAI nhưng dùng max_tokens (tolerant trên mọi server)
      body: body
    };
  }

  protected extractText(payload: Json): string {
    const choice = asArray(payload["choices"])[0];
    return asText(asRecord(asRecord(choice)["message"])["content"]);
  }

  protected extractFinishReason(payload: Json): string | undefined {
    const choice = asArray(payload["choices"])[0];
    const finish = asText(asRecord(choice)["finish_reason"]);
    return finish.length > 0 ? finish : undefined;
  }

  protected extractUsage(payload: Json): { inputTokens: number; outputTokens: number } | undefined {
    const usage = asRecord(payload["usage"]);
    const input = typeof usage["prompt_tokens"] === "number" ? usage["prompt_tokens"] : undefined;
    const output = typeof usage["completion_tokens"] === "number" ? usage["completion_tokens"] : undefined;
    return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : undefined;
  }

  protected extractStreamDelta(_event: SseEvent, parsed: Json): string {
    const choice = asArray(parsed["choices"])[0];
    return asText(asRecord(asRecord(choice)["delta"])["content"]);
  }

  // Tolerant listModels (5.2.5): {data:[{id}]} HOẶC {models:[{name}]} — id ?? name ?? model.
  override async listModels(config: LLMConfig): Promise<string[]> {
    const response = await getJson(trimSlash(requireBaseUrl(config)) + "/models", this.buildHeaders(config), {
      provider: this.id,
      timeoutMs: CALL_TIMEOUT.listModels
    });
    const payload = asRecord(await response.json());
    const items = asArray(payload["data"]).length > 0 ? asArray(payload["data"]) : asArray(payload["models"]);
    return items
      .map((item) => {
        const record = asRecord(item);
        return asText(record["id"]).length > 0 ? asText(record["id"]) : asText(record["name"]).length > 0 ? asText(record["name"]) : asText(record["model"]);
      })
      .filter((id) => id.length > 0);
  }
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function requireBaseUrl(config: LLMConfig): string {
  if (typeof config.baseUrl === "string" && config.baseUrl.length > 0) return config.baseUrl;
  throw new AppError("ERR-11", "errors.missingConfig", { field: "baseUrl" });
}
