// src/shared/storage-schema.ts — validators (BR-15) + defaults cho StorageWrapper.
// TDD §4.1 (file bổ sung: tách validator/defaults khỏi storage.ts — chuẩn file ≤ 200 dòng, §1.4 #7).
import { AppError } from "./errors";
import type { LLMConfig, ProviderId } from "./llm/types";
import type {
  AutomationConfig,
  GeneralConfig,
  KeyStorage,
  PromptsConfig,
  ReplyLanguage,
  ReplyTone,
  UiLanguage,
  VisionConfig
} from "./types";

export const PROVIDER_IDS: readonly ProviderId[] = [
  "openai",
  "azure",
  "anthropic",
  "gemini",
  "openai-compatible",
  "local"
];
export const UI_LANGUAGES: readonly UiLanguage[] = ["vi", "en"];
export const KEY_STORAGE_AREAS: readonly KeyStorage[] = ["sync", "local"];
export const REPLY_TONES: readonly ReplyTone[] = ["chinh-thuc", "than-mat", "ngan-gon"];
export const REPLY_LANGUAGES: readonly ReplyLanguage[] = ["auto", "vi", "en"];
const CLOUD_PROVIDERS: readonly ProviderId[] = ["openai", "azure", "anthropic", "gemini"];

// §6.1 CONFIG_GET ví dụ — defaults lần đầu (migration 6.3.1 #1; KHÔNG tạo key rỗng cho provider).
export const DEFAULT_GENERAL: GeneralConfig = { uiLanguage: "vi", keyStorage: "sync", extensionEnabled: true };
export const DEFAULT_PROMPTS: PromptsConfig = { customSystemPrompt: null, defaultTone: "chinh-thuc", replyLanguage: "auto" };
export const DEFAULT_AUTOMATION: AutomationConfig = {
  enabled: false, // BR-02 fail-closed
  rules: [],
  batchSize: 5,
  throttleMs: 1000,
  triageCap: 50
};
export const DEFAULT_VISION: VisionConfig = { enabled: false }; // BR-03
export const DEFAULT_ACTIVE_PROVIDER: ProviderId = "openai";

function badRequest(field: string, allowed: string): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field, allowed });
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw badRequest(field, allowed.join("|"));
}

function requireBool(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  throw badRequest(field, "boolean");
}

function requireInt(value: unknown, field: string, min: number, max: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return value;
  throw badRequest(field, "int:" + min + ".." + max);
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw badRequest(field, "non-empty string");
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

// §8.8 — baseUrl: https OK; http CHỈ localhost/127.0.0.1 (SR-06); http remote → từ chối.
export function validateBaseUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError("ERR-15", "errors.baseUrlInvalid", { field: field });
  }
  if (parsed.protocol === "https:") return value;
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && isLocal) return value;
  throw new AppError("ERR-15", "errors.baseUrlHttpsRequired", { field: field });
}

export function validateGeneral(value: unknown): GeneralConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    uiLanguage: requireEnum(raw["uiLanguage"] ?? DEFAULT_GENERAL.uiLanguage, UI_LANGUAGES, "uiLanguage"),
    keyStorage: requireEnum(raw["keyStorage"] ?? DEFAULT_GENERAL.keyStorage, KEY_STORAGE_AREAS, "keyStorage"),
    extensionEnabled: requireBool(raw["extensionEnabled"] ?? DEFAULT_GENERAL.extensionEnabled, "extensionEnabled")
  };
}

export function validatePrompts(value: unknown): PromptsConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  const custom = raw["customSystemPrompt"] ?? DEFAULT_PROMPTS.customSystemPrompt;
  return {
    customSystemPrompt: custom === null || typeof custom === "string" ? (custom as string | null) : null,
    defaultTone: requireEnum(raw["defaultTone"] ?? DEFAULT_PROMPTS.defaultTone, REPLY_TONES, "defaultTone"),
    replyLanguage: requireEnum(raw["replyLanguage"] ?? DEFAULT_PROMPTS.replyLanguage, REPLY_LANGUAGES, "replyLanguage")
  };
}

function validateRule(value: unknown): AutoModeRuleProps {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    senderPattern: typeof raw["senderPattern"] === "string" ? raw["senderPattern"] : undefined,
    subjectPattern: typeof raw["subjectPattern"] === "string" ? raw["subjectPattern"] : undefined,
    minImportance: typeof raw["minImportance"] === "number" ? raw["minImportance"] : undefined
  };
}

interface AutoModeRuleProps {
  senderPattern?: string;
  subjectPattern?: string;
  minImportance?: number;
}

export function validateAutomation(value: unknown): AutomationConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(raw["rules"]) ? (raw["rules"] as unknown[]).map(validateRule) : DEFAULT_AUTOMATION.rules;
  return {
    enabled: requireBool(raw["enabled"] ?? DEFAULT_AUTOMATION.enabled, "automation.enabled"),
    rules: rules,
    batchSize: requireInt(raw["batchSize"] ?? DEFAULT_AUTOMATION.batchSize, "batchSize", 1, 50),
    throttleMs: requireInt(raw["throttleMs"] ?? DEFAULT_AUTOMATION.throttleMs, "throttleMs", 0, 60_000),
    triageCap: requireInt(raw["triageCap"] ?? DEFAULT_AUTOMATION.triageCap, "triageCap", 1, 500)
  };
}

export function validateVision(value: unknown): VisionConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return { enabled: requireBool(raw["enabled"] ?? DEFAULT_VISION.enabled, "vision.enabled") };
}

// §8.8 — LLMConfig per-provider: key bắt buộc 4 cloud; baseUrl cho compatible (SR-06);
// model không rỗng; azure.apiVersion định dạng YYYY-MM-DD; local.url localhost + preset enum.
export function validateProviderConfig(value: unknown): LLMConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  const provider = requireEnum(raw["provider"], PROVIDER_IDS, "provider");
  const config: LLMConfig = { provider: provider, model: requireNonEmpty(raw["model"], "model") };
  if (typeof raw["apiKey"] === "string" && raw["apiKey"].length > 0) config.apiKey = raw["apiKey"];
  if ((CLOUD_PROVIDERS as readonly string[]).includes(provider)) {
    requireNonEmpty(config.apiKey, "apiKey"); // BR-04
  }
  if (provider === "openai-compatible") {
    config.baseUrl = validateBaseUrl(requireNonEmpty(raw["baseUrl"], "baseUrl"), "baseUrl");
  }
  if (provider === "azure") {
    const azure = (raw["azure"] ?? {}) as Record<string, unknown>;
    config.azure = {
      endpoint: requireNonEmpty(azure["endpoint"], "azure.endpoint"),
      deployment: requireNonEmpty(azure["deployment"], "azure.deployment"),
      apiVersion: requireNonEmpty(azure["apiVersion"], "azure.apiVersion")
    };
  }
  if (provider === "local") {
    const local = (raw["local"] ?? {}) as Record<string, unknown>;
    const url = validateBaseUrl(requireNonEmpty(local["url"], "local.url"), "local.url");
    config.local = {
      url: url,
      preset: requireEnum(local["preset"] ?? "ollama", ["ollama", "lmstudio"] as const, "local.preset")
    };
  }
  return config;
}
