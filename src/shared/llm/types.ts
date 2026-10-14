// src/shared/llm/types.ts — LLM types chuẩn hóa (TDD §4.2 — interface CHỈ THÔI, adapters GĐ2).
// DISC-1: keyStorage KHÔNG nằm trong LLMConfig — canonical ở config.general (TDD §3.3, §6.3).

export type ProviderId =
  | "openai"
  | "azure"
  | "anthropic"
  | "gemini"
  | "openai-compatible"
  | "local";

export interface LLMConfig {
  provider: ProviderId;
  apiKey?: string; // bắt buộc 4 provider cloud (BR-04) — KHÔNG chứa keyStorage (DISC-1)
  baseUrl?: string; // bắt buộc openai-compatible; http CHỈ cho localhost (SR-06, §8.8)
  model: string;
  azure?: { endpoint: string; deployment: string; apiVersion: string };
  local?: { url: string; preset: "ollama" | "lmstudio" };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  finishReason?: string; // NORMALIZE: OpenAI finish_reason / Anthropic stop_reason (end_turn→stop) / Gemini (STOP→stop)
  usage?: { inputTokens: number; outputTokens: number }; // NORMALIZE (§4.2, 5.2.x)
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number; // default 2048 — Anthropic bắt buộc (#11)
  timeoutMs?: number; // 15s test/list · 60s chat · idle 30s stream (§9.1)
  signal?: AbortSignal; // gắn Port cancel (§6.2)
  visionImage?: { base64: string; mediaType: string }; // chỉ T3 (BR-03)
}

export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TEMPERATURE = { analyze: 0.3, reply: 0.7, triage: 0.2 } as const;
export const LOCATE_TEMPERATURE = 0; // deterministic (§15.2 #6)

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

// «interface» adapter chuẩn hóa 6 provider (PLAN.md mục 5) — GĐ2 mới implement adapters.
export interface LLMAdapter {
  id: ProviderId;
  chat(config: LLMConfig, messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse>;
  chatStream(config: LLMConfig, messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
  listModels(config: LLMConfig): Promise<string[]>;
  testConnection(config: LLMConfig): Promise<TestConnectionResult>;
}
