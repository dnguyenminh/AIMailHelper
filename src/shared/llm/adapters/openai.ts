// src/shared/llm/adapters/openai.ts — OpenAI adapter + base cho Azure/Compatible (FSD 5.2.1).
// max_completion_tokens → fallback max_tokens (TA note 5.2.1); stream_options.include_usage; SSE + [DONE];
// listModels /v1/models + filter embedding/whisper/tts/... (5.2.1).
import { CALL_TIMEOUT, getJson } from "../call";
import { asArray, asNumber, asRecord, asText, BaseLLMAdapter } from "../base-adapter";
import type { CallContext, Json, WireRequest } from "../base-adapter";
import { isMaxTokensUnsupported } from "../errmap";
import { applyOpenAIImage } from "../vision-wire";
import type { ChatMessage, ChatOptions, LLMConfig, LLMResponse, ProviderId } from "../types";
import type { SseEvent } from "../sse";

const API_ROOT = "https://api.openai.com/v1";
// Filter gợi ý — bỏ id khớp các nhóm không dùng cho chat (5.2.1 listModels note).
const EXCLUDED_MODEL_PATTERN = /embedding|whisper|tts|dall-e|moderation|babbage|davinci/i;

export class OpenAIAdapter extends BaseLLMAdapter {
  // Widened ProviderId để subclass (local) override literal khác (LLMAdapter.id: ProviderId)
  readonly id: ProviderId = "openai";

  async chat(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions = {}, ctx: CallContext = {}): Promise<LLMResponse> {
    const effective: CallContext = { maxTokenField: "max_completion_tokens", ...ctx };
    try {
      return await super.chat(config, messages, opts, effective);
    } catch (error) {
      if (!isMaxTokensUnsupported(error)) throw error;
      effective.maxTokenField = "max_tokens"; // model cũ từ chối max_completion_tokens → fallback
      return await super.chat(config, messages, opts, effective);
    }
  }

  protected buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean, ctx: CallContext): WireRequest {
    const body: Json = {
      model: config.model,
      messages: messages,
      stream: stream,
      temperature: opts.temperature ?? 0.3,
      [ctx.maxTokenField ?? "max_completion_tokens"]: opts.maxTokens ?? 2048
    };
    if (stream) body["stream_options"] = { include_usage: true }; // usage ở chunk cuối (5.2.1)
    if (opts.visionImage) applyOpenAIImage(body, opts.visionImage); // GĐ4 T3 — gated additive (vision-wire)
    return {
      url: API_ROOT + "/chat/completions",
      headers: { "Authorization": "Bearer " + requiredKey(config), "Content-Type": "application/json" },
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
    const input = asNumber(usage["prompt_tokens"]);
    const output = asNumber(usage["completion_tokens"]);
    return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : undefined;
  }

  protected extractStreamDelta(_event: SseEvent, parsed: Json): string {
    const choice = asArray(parsed["choices"])[0];
    return asText(asRecord(asRecord(choice)["delta"])["content"]);
  }

  // GET /v1/models → data[].id, filter nhóm không chat (5.2.1).
  override async listModels(config: LLMConfig): Promise<string[]> {
    const response = await getJson(API_ROOT + "/models", this.listHeaders(config), {
      provider: this.id,
      timeoutMs: CALL_TIMEOUT.listModels
    });
    const payload = asRecord(await response.json());
    return asArray(payload["data"])
      .map((item) => asText(asRecord(item)["id"]))
      .filter((id) => id.length > 0 && !EXCLUDED_MODEL_PATTERN.test(id));
  }

  protected listHeaders(config: LLMConfig): Record<string, string> {
    return { "Authorization": "Bearer " + requiredKey(config) };
  }
}

export function requiredKey(config: LLMConfig): string {
  return config.apiKey ?? "";
}
