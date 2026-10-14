// src/shared/llm/permissions.ts — kiểm soát host permission LLM (BR-05, TDD §8.3).
// Cloud 4 provider: host_permissions TĨNH trong manifest (GĐ2 bổ sung).
// Provider tùy chỉnh/local: optional_host_permissions — xin LÚC LƯU CẤU HÌNH (user gesture),
// SW check chrome.permissions.contains trước fetch → thiếu → ERR-14 (không fail im lặng).
import { AppError } from "../errors";
import type { LLMConfig } from "./types";

// Host tĩnh đã khai báo trong manifest host_permissions (§8.3 — GĐ2).
const STATIC_HOST_SUFFIXES: readonly string[] = [
  "api.openai.com",
  "openai.azure.com", // khớp *.openai.azure.com (suffix)
  "api.anthropic.com",
  "generativelanguage.googleapis.com"
];

function isStaticallyAllowed(hostname: string): boolean {
  return STATIC_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith("." + suffix));
}

// URL động cần optional permission: baseUrl (compatible) / local.url / azure.endpoint lạ.
export function requestOrigin(config: LLMConfig): string | null {
  if (config.provider === "openai-compatible" && config.baseUrl) return originOf(config.baseUrl);
  if (config.provider === "local" && config.local) return originOf(config.local.url);
  if (config.provider === "azure" && config.azure) return azureOrigin(config.azure.endpoint);
  return null;
}

function originOf(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (isStaticallyAllowed(parsed.hostname)) return null;
    return parsed.protocol + "//" + parsed.host;
  } catch {
    return null; // URL hỏng đã bị validateProviderConfig từ chối trước đó
  }
}

function azureOrigin(endpoint: string): string | null {
  try {
    const parsed = new URL(endpoint);
    return isStaticallyAllowed(parsed.hostname) ? null : parsed.protocol + "//" + parsed.host;
  } catch {
    return null;
  }
}

// §8.3 — SW check trước fetch; thiếu → ERR-14 kèm origin (BR-05).
export async function ensureHostPermission(config: LLMConfig): Promise<void> {
  const origin = requestOrigin(config);
  if (origin === null) return; // host tĩnh trong manifest
  const granted = await chrome.permissions.contains({ origins: [origin + "/*"] });
  if (!granted) throw new AppError("ERR-14", "errors.hostPermission", { origin: origin });
}
