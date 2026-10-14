// src/shared/redact.ts — redactSecrets ĐA PATTERN, MỘT điểm redact duy nhất (SR-03, TDD §8.1).
// Patterns: sk-… (OpenAI/Anthropic sk-ant-…/OpenRouter sk-or-…/generic) · AIza… (Gemini) · hex-32 (Azure).
// Defense-in-depth: redact là LỚP CUỐI — KHÔNG BAO GIỜ serialize headers/auth/config vào log từ đầu.

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
