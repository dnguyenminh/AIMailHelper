// src/shared/llm/adapters/local.ts — Local LLM Ollama / LM Studio (FSD 5.2.6; Open Issue #1 chốt).
// Kế thừa OpenAICompatible (SSE openai-compatible làm chính — NDJSON chỉ là Plan B trong sse.ts).
// Preset: Ollama http://localhost:11434 (chat /v1/chat/completions, listModels /api/tags);
//         LM Studio http://localhost:1234/v1 (chat /chat/completions, listModels /models).
// KHÔNG gửi Authorization; 403 (thiếu OLLAMA_ORIGINS) → ERR-05 + hướng dẫn env (FR-GD2-07).
import { asArray, asRecord, asText } from "../base-adapter";
import { AppError } from "../../errors";
import { CALL_TIMEOUT, getJson } from "../call";
import type { LLMConfig, ProviderId } from "../types";
import { OpenAICompatibleAdapter } from "./openai-compatible";

export class LocalAdapter extends OpenAICompatibleAdapter {
  readonly id: ProviderId = "local";

  // Chat URL theo preset: url có đuôi /v1 (LM Studio) → nối thẳng; không (Ollama) → thêm /v1.
  protected override chatUrl(config: LLMConfig): string {
    const base = trimSlash(requireLocalUrl(config));
    return base.endsWith("/v1") ? base + "/chat/completions" : base + "/v1/chat/completions";
  }

  protected override buildHeaders(_config: LLMConfig): Record<string, string> {
    // Auth: KHÔNG cần key — KHÔNG BAO GIỜ gửi Authorization (5.2.6), kể cả khi apiKey tồn tại.
    return { "Content-Type": "application/json" };
  }

  // Ollama → GET {url}/api/tags (models[].name); LM Studio → GET {url}/models (data[].id).
  override async listModels(config: LLMConfig): Promise<string[]> {
    const base = trimSlash(requireLocalUrl(config));
    const preset = config.local?.preset ?? "ollama";
    const url = preset === "ollama" ? base + "/api/tags" : base + "/models";
    const response = await getJson(url, { "Content-Type": "application/json" }, { provider: this.id, timeoutMs: CALL_TIMEOUT.listModels });
    const payload = asRecord(await response.json());
    const items = preset === "ollama" ? asArray(payload["models"]) : asArray(payload["data"]);
    return items.map((item) => modelIdOf(item)).filter((id) => id.length > 0);
  }
}

function modelIdOf(item: unknown): string {
  const record = asRecord(item);
  return asText(record["name"]).length > 0 ? asText(record["name"]) : asText(record["id"]);
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Local: URL nằm ở config.local.url (preset 5.2.6) — fallback baseUrl cho tương thích shape cũ.
function requireLocalUrl(config: LLMConfig): string {
  if (config.local?.url !== undefined && config.local.url.length > 0) return config.local.url;
  if (typeof config.baseUrl === "string" && config.baseUrl.length > 0) return config.baseUrl;
  throw new AppError("ERR-11", "errors.missingConfig", { field: "local.url" });
}
