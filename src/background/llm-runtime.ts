// src/background/llm-runtime.ts — resolve adapter/config + ChatOptions defaults per kind (TDD §4.4).
// TEST_CONNECTION/LIST_MODELS: payload có thể thiếu key (BR-08 — CONFIG_GET không trả key) → merge
// key/baseUrl từ config ĐÃ LƯU của provider đó; key chưa bao giờ rời SW.
import { AppError } from "../shared/errors";
import { llmRegistry } from "../shared/llm/registry";
import { isProviderId } from "../shared/storage-schema";
import { validateProviderConfig } from "../shared/storage-schema";
import { storage } from "../shared/storage";
import type { LLMAdapter, LLMConfig, ProviderId } from "../shared/llm/types";

export interface ActiveLLM {
  adapter: LLMAdapter;
  config: LLMConfig;
}

// Provider đang hoạt động → adapter + config đã lưu; chưa lưu → ERR-11 (§6.1 #1).
export async function resolveActive(): Promise<ActiveLLM> {
  const provider = await storage.getActiveProvider();
  const config = await storage.getProviderConfig(provider);
  if (config === null) {
    throw new AppError("ERR-11", "errors.missingConfig", { provider: provider });
  }
  return { adapter: llmRegistry.get(provider), config: config };
}

interface PartialPayload {
  provider?: unknown;
  apiKey?: unknown;
  [key: string]: unknown;
}

// §6.1 #4-5: validate payload config + merge field còn thiếu từ config đã lưu (key không qua UI — BR-08).
export async function resolveRequestConfig(raw: unknown): Promise<LLMConfig> {
  const payload = (raw ?? {}) as PartialPayload;
  const provider = payload.provider;
  if (!isProviderId(provider)) {
    throw new AppError("ERR-15", "errors.badRequest", { field: "provider" });
  }
  const stored = await storage.getProviderConfig(provider);
  const merged: Record<string, unknown> = { ...(stored ?? {}), ...withoutEmptyApiKey(payload), provider: provider as ProviderId };
  return validateProviderConfig(merged);
}

function withoutEmptyApiKey(payload: PartialPayload): Record<string, unknown> {
  const { apiKey, ...rest } = payload;
  if (typeof apiKey === "string" && apiKey.length > 0) return { ...rest, apiKey: apiKey };
  return rest; // rỗng/thiếu → giữ key đã lưu (nếu có)
}
