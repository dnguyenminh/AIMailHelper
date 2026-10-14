// src/background/handlers/connection.handler.ts — TEST_CONNECTION/LIST_MODELS thật (TDD §6.1 #4-5; GĐ2).
// TEST_CONNECTION: 15s hard timeout trong adapter; ok → {ok, message, latencyMs}; lỗi → AppError envelope
// (i18nKey, KHÔNG chứa key — redactSecrets SR-03 ở errmap). LIST_MODELS tolerant; fail → ERR — KHÔNG
// chặn lưu cấu hình (BR-17, phía UI xử lý).
import { llmRegistry } from "../../shared/llm/registry";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { resolveRequestConfig } from "../llm-runtime";
import type { LLMConfig } from "../../shared/llm/types";
import type { MessageRouter, RpcHandler } from "../router";

export function registerConnectionHandlers(router: MessageRouter): void {
  router.register("TEST_CONNECTION", handleTestConnection);
  router.register("LIST_MODELS", handleListModels);
}

function parsePayload(raw: unknown): { config: unknown } {
  const payload = (raw ?? {}) as Record<string, unknown>;
  return { config: payload["config"] };
}

const handleTestConnection: RpcHandler = async (payload): Promise<{ ok: boolean; message: string; latencyMs: number }> => {
  const config: LLMConfig = await resolveRequestConfig(parsePayload(payload).config);
  await ensureHostPermission(config); // BR-05 — ERR-14 khi thiếu optional permission (§8.3)
  return llmRegistry.get(config.provider).testConnection(config);
};

const handleListModels: RpcHandler = async (payload): Promise<{ models: string[] }> => {
  const config: LLMConfig = await resolveRequestConfig(parsePayload(payload).config);
  await ensureHostPermission(config);
  const models = await llmRegistry.get(config.provider).listModels(config);
  return { models: models };
};
