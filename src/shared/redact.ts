// src/shared/redact.ts — redactSecrets ĐA PATTERN, MỘT điểm redact duy nhất (SR-03, TDD §8.1).
// Patterns: sk-… (OpenAI/Anthropic sk-ant-…/OpenRouter sk-or-…/generic) · AIza… (Gemini) · hex-32 (Azure).
// Defense-in-depth: redact là LỚP CUỐI — KHÔNG BAO GIỜ serialize headers/auth/config vào log từ đầu.
// UAT 20/10 bổ sung: redactSrc — redact URL cho báo cáo UC-09 (bond/token/uuid không lọt).

const REDACTED = "[redacted]";

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{10,}/g, // OpenAI + Anthropic + OpenRouter + generic "sk-"
  /AIza[0-9A-Za-z_-]{35}/g, // Gemini API key
  /\b[0-9a-fA-F]{32}\b/g // Azure api-key (hex 32 — chấp nhận false positive trong log path)
];

// Mọi match → "[redacted]" (TDD §8.1 SR-03).
export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, REDACTED);
  return output;
}

// §8.8 — provider error message sanitize: redact key-like + cap 500 ký tự + gọn whitespace.
export function sanitizeProviderMessage(raw: string): string {
  const capped = raw.length > 500 ? raw.slice(0, 500) : raw;
  return redactSecrets(capped).replace(/\s+/g, " ").trim();
}

// redactConfig — bọc redactSecrets cho console.log có config: apiKey → "[redacted]" (shallow copy).
export function redactConfig<T extends object>(config: T): T {
  const copy = { ...config } as Record<string, unknown>;
  if (typeof copy["apiKey"] === "string") copy["apiKey"] = REDACTED;
  if (copy["azure"] && typeof copy["azure"] === "object") {
    copy["azure"] = redactConfig(copy["azure"] as object);
  }
  return copy as unknown as T;
}

// redactSrc — URL an toàn cho báo cáo: blob:/data: chỉ báo độ dài; about: giữ nguyên;
// http(s) → origin + path cuối (query/hash strip: usid/sig/token không lọt); tương đối giữ nguyên.
export function redactSrc(src: string): string {
  if (src.startsWith("blob:")) return "blob:<" + String(src.length) + " chars>";
  const dataMatch = src.match(/^(data:[^;,]+)/);
  if (dataMatch !== null) return (dataMatch[1] ?? "data:") + ";base64,<" + String(src.length) + " chars>";
  if (src.startsWith("about:")) return src;
  if (!/^https?:/i.test(src)) return (src.split("?")[0] ?? src).split("#")[0] ?? "";
  const parts = ((src.split("?")[0] ?? src).split("#")[0] ?? "").split("/");
  const origin = (parts[0] ?? "") + "//" + (parts[2] ?? "");
  return (origin + "/…/" + (parts[parts.length - 1] ?? "")).slice(0, 80);
}
