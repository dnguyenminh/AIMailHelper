// src/shared/llm/adapters/azure.ts — Azure OpenAI (FSD 5.2.2).
// Header "api-key" (KHÔNG Bearer); deployment trong path; body KHÔNG có trường model (SR — §5.2.2);
// max_tokens; finish_reason "content_filter" → thông báo riêng; KHÔNG listModels (BR-17 — nhập tay).
import { asArray, asNumber, asRecord, asText, BaseLLMAdapter } from "../base-adapter";
import type { Json, WireRequest } from "../base-adapter";
import { AppError } from "../../errors";
import type { ChatMessage, ChatOptions, LLMConfig } from "../types";
import type { SseEvent } from "../sse";
import { requiredKey } from "./openai";
import { applyOpenAIImage } from "../vision-wire";

export class AzureAdapter extends BaseLLMAdapter {
  readonly id = "azure" as const;

  protected buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): WireRequest {
    const azure = requireAzure(config);
    const body: Json = {
      messages: messages,
      stream: stream,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2048
    };
    if (opts.visionImage) applyOpenAIImage(body, opts.visionImage); // GĐ4 T3 — gated additive (vision-wire)
    return {
      url: azure.endpoint.replace(/\/$/, "") + "/openai/deployments/" + azure.deployment + "/chat/completions?api-version=" + azure.apiVersion,
      headers: { "api-key": requiredKey(config), "Content-Type": "application/json" },
      // KHÔNG có "model" — deployment nằm trong path (5.2.2); max_tokens an toàn với mọi api-version.
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
    return finish.length > 0 ? finish : undefined; // "content_filter" → finishReasonError (base)
  }

  protected extractUsage(payload: Json): { inputTokens: number; outputTokens: number } | undefined {
    const usage = asRecord(payload["usage"]);
    const input = asNumber(usage["prompt_tokens"]);
    const output = asNumber(usage["completion_tokens"]);
    return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : undefined;
  }

  protected extractStreamDelta(_event: SseEvent, parsed: Json): string {
    // chunk đầu có thể chỉ chứa prompt_filter_results (bỏ qua tự nhiên — không có delta.content)
    const choice = asArray(parsed["choices"])[0];
    return asText(asRecord(asRecord(choice)["delta"])["content"]);
  }

  // KHÔNG listModels: deployment name ≠ model id → ModelPicker nhập tay (BR-17 — base đã throw).
}

function requireAzure(config: LLMConfig): { endpoint: string; deployment: string; apiVersion: string } {
  if (config.azure && config.azure.endpoint.length > 0 && config.azure.deployment.length > 0 && config.azure.apiVersion.length > 0) {
    return config.azure;
  }
  throw new AppError("ERR-11", "errors.missingConfig", { field: "azure" }); // §8.8 — thiếu trường bắt buộc
}
