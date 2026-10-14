// src/shared/llm/registry.ts — Factory/Registry pattern (TDD §3.2/§4.3).
// Map ProviderId → adapter instance; adapter stateless (config truyền vào từng call — UC-05 EF-6);
// thêm provider mới = thêm 1 file + 1 dòng đăng ký, không đụng SW/panel (FR-GD2-01).
import type { LLMAdapter, ProviderId } from "./types";
import { OpenAIAdapter } from "./adapters/openai";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible";
import { AzureAdapter } from "./adapters/azure";
import { AnthropicAdapter } from "./adapters/anthropic";
import { GeminiAdapter } from "./adapters/gemini";
import { LocalAdapter } from "./adapters/local";

export interface LLMRegistry {
  get(id: ProviderId): LLMAdapter;
}

export function createLLMRegistry(): LLMRegistry {
  const adapters: Record<ProviderId, LLMAdapter> = {
    "openai": new OpenAIAdapter(),
    "azure": new AzureAdapter(),
    "anthropic": new AnthropicAdapter(),
    "gemini": new GeminiAdapter(),
    "openai-compatible": new OpenAICompatibleAdapter(),
    "local": new LocalAdapter()
  };
  return {
    get: (id: ProviderId): LLMAdapter => adapters[id]
  };
}

// Singleton cho SW — mọi LLM call đi qua 1 điểm kiểm soát duy nhất (§2.1/#4).
export const llmRegistry: LLMRegistry = createLLMRegistry();
