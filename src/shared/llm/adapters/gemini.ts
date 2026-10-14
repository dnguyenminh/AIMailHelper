// src/shared/llm/adapters/gemini.ts — Gemini generateContent (FSD 5.2.4).
// Header x-goog-api-key (KHÔNG ?key= — BR-08); role assistant → "model"; system → systemInstruction;
// stream ?alt=sse KHÔNG [DONE] — server close = done; SAFETY → ERR-15; 400 API_KEY_INVALID→ERR-02 (DISC-2);
// listModels /v1beta/models — filter generateContent + strip prefix "models/".
import { CALL_TIMEOUT, getJson } from "../call";
import { asArray, asNumber, asRecord, asText, BaseLLMAdapter } from "../base-adapter";
import type { Json, WireRequest } from "../base-adapter";
import type { ChatMessage, ChatOptions, LLMConfig, ProviderId } from "../types";
import type { SseEvent } from "../sse";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiAdapter extends BaseLLMAdapter {
  readonly id: ProviderId = "gemini";

  protected buildHeaders(config: LLMConfig): Record<string, string> {
    return { "x-goog-api-key": config.apiKey ?? "", "Content-Type": "application/json" };
  }

  protected buildRequest(config: LLMConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): WireRequest {
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    const body: Json = {
      ...transformMessages(messages),
      generationConfig: { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens ?? 2048 }
    };
    return {
      url: API_ROOT + "/models/" + encodeURIComponent(config.model) + ":" + action,
      headers: this.buildHeaders(config),
      body: body
    };
  }

  protected extractText(payload: Json): string {
    const parts = asRecord(asArray(payload["candidates"])[0])["content"];
    return asArray(asRecord(parts)["parts"]).map((part) => asText(asRecord(part)["text"])).join("");
  }

  protected extractFinishReason(payload: Json): string | undefined {
    const finish = asText(asRecord(asArray(payload["candidates"])[0])["finishReason"]);
    if (finish.length === 0) return undefined;
    return finish === "STOP" ? "stop" : finish; // NORMALIZE STOP→stop (§4.2); SAFETY → finishReasonError
  }

  protected extractUsage(payload: Json): { inputTokens: number; outputTokens: number } | undefined {
    const usage = asRecord(payload["usageMetadata"]);
    const input = asNumber(usage["promptTokenCount"]);
    const output = asNumber(usage["candidatesTokenCount"]);
    return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : undefined;
  }

  protected extractStreamDelta(_event: SseEvent, parsed: Json): string {
    const candidate = asRecord(asArray(parsed["candidates"])[0]);
    const parts = asArray(asRecord(candidate["content"])["parts"]);
    return parts.length > 0 ? asText(asRecord(parts[0])["text"]) : "";
  }

  // GET /v1beta/models — lọc model hỗ trợ generateContent; strip prefix "models/" (5.2.4).
  override async listModels(config: LLMConfig): Promise<string[]> {
    const response = await getJson(API_ROOT + "/models", this.buildHeaders(config), {
      provider: this.id,
      timeoutMs: CALL_TIMEOUT.listModels
    });
    const payload = asRecord(await response.json());
    return asArray(payload["models"])
      .filter((item) => {
        const methods = asArray(asRecord(item)["supportedGenerationMethods"]).map(String);
        return methods.length === 0 || methods.includes("generateContent");
      })
      .map((item) => asText(asRecord(item)["name"]).replace(/^models\//, ""))
      .filter((name) => name.length > 0);
  }
}

// system → systemInstruction top-level; role assistant → "model"; gộp message liên tiếp cùng role.
function transformMessages(messages: ChatMessage[]): { systemInstruction?: Json; contents: Json[] } {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const result: { systemInstruction?: Json; contents: Json[] } = { contents: [] };
  if (systemParts.length > 0) result.systemInstruction = { parts: systemParts.map((text) => ({ text: text })) };
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "model" : "user";
    const last = result.contents[result.contents.length - 1];
    if (last && last["role"] === role) {
      (last["parts"] as Json[]).push({ text: message.content });
    } else {
      result.contents.push({ role: role, parts: [{ text: message.content }] });
    }
  }
  return result;
}
