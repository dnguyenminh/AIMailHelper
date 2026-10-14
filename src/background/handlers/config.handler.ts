// src/background/handlers/config.handler.ts — CONFIG_GET/SET + KEY_STORAGE_SET (TDD §4.4, §6.1 #1-3).
// CONFIG_GET KHÔNG trả apiKey nguyên văn — chỉ hasKey (BR-08).
import { AppError } from "../../shared/errors";
import type { ProviderId } from "../../shared/llm/types";
import { storage } from "../../shared/storage";
import { isProviderId } from "../../shared/storage-schema";
import type { ConfigGetResponse, AutomationConfig, GeneralConfig, KeyStorage, PromptsConfig, ProviderStatus, VisionConfig } from "../../shared/types";
import type { MessageRouter, RpcHandler } from "../router";

export function registerConfigHandlers(router: MessageRouter): void {
  router.register("CONFIG_GET", handleConfigGet);
  router.register("CONFIG_SET", handleConfigSet);
  router.register("KEY_STORAGE_SET", handleKeyStorageSet);
}

const handleConfigGet: RpcHandler = async (): Promise<ConfigGetResponse> => {
  const [general, prompts, automation, vision, activeProvider] = await Promise.all([
    storage.getGeneral(),
    storage.getPrompts(),
    storage.getAutomation(),
    storage.getVision(),
    storage.getActiveProvider()
  ]);
  const providers = {} as Record<ProviderId, ProviderStatus>;
  const providerIds: ProviderId[] = ["openai", "azure", "anthropic", "gemini", "openai-compatible", "local"];
  for (const id of providerIds) {
    const config = await storage.getProviderConfig(id);
    const hasKey = config !== null && typeof config.apiKey === "string" && config.apiKey.length > 0;
    providers[id] = { hasKey: hasKey, keyStorage: general.keyStorage };
  }
  return { general: general, prompts: prompts, automation: automation, vision: vision, activeProvider: activeProvider, providers: providers };
};

interface ConfigSetPayload {
  section: "general" | "prompts" | "automation" | "vision" | "provider";
  providerId?: unknown;
  value: unknown;
}

const handleConfigSet: RpcHandler = async (payload): Promise<{ ok: true }> => {
  const request = parseConfigSet(payload);
  switch (request.section) {
    case "general":
      await storage.setGeneral(request.value as GeneralConfig);
      break;
    case "prompts":
      await storage.setPrompts(request.value as PromptsConfig);
      break;
    case "automation":
      await storage.setAutomation(request.value as AutomationConfig);
      break;
    case "vision":
      await storage.setVision(request.value as VisionConfig);
      break;
    case "provider":
      await setProviderSection(request);
      break;
    default:
      throw new AppError("ERR-15", "errors.badRequest", { field: "section" });
  }
  return { ok: true };
};

async function setProviderSection(request: ConfigSetPayload): Promise<void> {
  const providerId = request.providerId;
  if (!isProviderId(providerId)) {
    throw new AppError("ERR-15", "errors.badRequest", { field: "providerId" });
  }
  await storage.setProviderConfig(providerId as ProviderId, request.value);
}

const handleKeyStorageSet: RpcHandler = async (payload): Promise<{ ok: true }> => {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const target = raw["keyStorage"];
  if (target !== "sync" && target !== "local") {
    throw new AppError("ERR-15", "errors.badRequest", { field: "keyStorage", allowed: "sync|local" });
  }
  // BR-04: ghi khu mới + XÓA khu cũ — 1 điểm duy nhất trong storage.setKeyStorage.
  await storage.setKeyStorage(target as KeyStorage);
  return { ok: true };
};

function parseConfigSet(payload: unknown): ConfigSetPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const section = raw["section"];
  const sections = ["general", "prompts", "automation", "vision", "provider"];
  if (typeof section !== "string" || !sections.includes(section) || !("value" in raw)) {
    throw new AppError("ERR-15", "errors.badRequest", { field: "section" });
  }
  return { section: section as ConfigSetPayload["section"], providerId: raw["providerId"], value: raw["value"] };
}
