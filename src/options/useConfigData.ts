// src/options/useConfigData.ts — hook dùng chung Options: CONFIG_GET + helpers CONFIG_SET/RPC (GĐ2).
// Mọi thao tác nói chuyện với SW qua RPC — KHÔNG fetch trực tiếp (§2.1); lỗi AppError ném lên caller.
import { useCallback, useEffect, useState } from "react";
import type { LLMConfig, ProviderId } from "../shared/llm/types";
import { sendMessage } from "../shared/messaging";
import type { AutomationConfig, ConfigGetResponse, GeneralConfig, PromptsConfig } from "../shared/types";

export interface ConfigData {
  data: ConfigGetResponse | null;
  reload: () => Promise<void>;
  setGeneral: (value: GeneralConfig) => Promise<void>;
  setPrompts: (value: PromptsConfig) => Promise<void>;
  setAutomation: (value: AutomationConfig) => Promise<void>;
  setProvider: (providerId: ProviderId, value: LLMConfig) => Promise<void>;
  setActiveProvider: (providerId: ProviderId) => Promise<void>;
  setKeyStorage: (keyStorage: "sync" | "local") => Promise<void>;
}

export function useConfigData(): ConfigData {
  const [data, setData] = useState<ConfigGetResponse | null>(null);
  const reload = useCallback(async (): Promise<void> => {
    setData(await sendMessage<ConfigGetResponse>("CONFIG_GET"));
  }, []);
  useEffect(() => {
    void reload().catch((error) => console.warn("[AIMH][options] CONFIG_GET failed", error));
  }, [reload]);

  const setGeneral = useCallback(async (value: GeneralConfig): Promise<void> => {
    await sendMessage("CONFIG_SET", { section: "general", value: value });
    await reload();
  }, [reload]);

  const setPrompts = useCallback(async (value: PromptsConfig): Promise<void> => {
    await sendMessage("CONFIG_SET", { section: "prompts", value: value });
    await reload();
  }, [reload]);

  const setAutomation = useCallback(async (value: AutomationConfig): Promise<void> => {
    await sendMessage("CONFIG_SET", { section: "automation", value: value });
    await reload();
  }, [reload]);

  const setProvider = useCallback(async (providerId: ProviderId, value: LLMConfig): Promise<void> => {
    await sendMessage("CONFIG_SET", { section: "provider", providerId: providerId, value: value });
    await reload();
  }, [reload]);

  const setActiveProvider = useCallback(async (providerId: ProviderId): Promise<void> => {
    await sendMessage("CONFIG_SET", { section: "activeProvider", value: providerId });
    await reload();
  }, [reload]);

  const setKeyStorage = useCallback(async (keyStorage: "sync" | "local"): Promise<void> => {
    await sendMessage("KEY_STORAGE_SET", { keyStorage: keyStorage });
    await reload();
  }, [reload]);

  return { data: data, reload: reload, setGeneral: setGeneral, setPrompts: setPrompts, setAutomation: setAutomation, setProvider: setProvider, setActiveProvider: setActiveProvider, setKeyStorage: setKeyStorage };
}

// defaultDraftFor — template form lần đầu theo provider (FSD §3.4 Màn 2 #1).
export function defaultDraftFor(provider: ProviderId): LLMConfig {
  const base = { provider: provider, model: "" };
  switch (provider) {
    case "openai":
      return { ...base, model: "gpt-4o-mini" };
    case "azure":
      return { ...base, model: "deployment", azure: { endpoint: "https://", deployment: "", apiVersion: "2024-10-21" } };
    case "anthropic":
      return { ...base, model: "claude-sonnet-4-5" };
    case "gemini":
      return { ...base, model: "gemini-2.5-flash" };
    case "openai-compatible":
      return { ...base, baseUrl: "https://openrouter.ai/api/v1" };
    case "local":
      return { ...base, local: { url: "http://localhost:11434", preset: "ollama" } };
  }
}
