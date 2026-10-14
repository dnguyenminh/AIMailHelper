// tests/redact.test.ts — SR-03 (TDD §8.1): redactSecrets đa pattern với 4 fixture key định dạng thật;
// sanitizeProviderMessage (cap 500 + redact); redactConfig; key không lọt output (BR-08, AC US-10).
import { describe, expect, it } from "vitest";
import { redactConfig, redactSecrets, sanitizeProviderMessage } from "../src/shared/redact";
import { FIXTURE_KEYS } from "./llm/helpers";

describe("redactSecrets — 4 fixture key thật per provider (SR-03)", () => {
  it("sk-… (OpenAI) → [redacted]", () => {
    const input = "Incorrect API key provided: " + FIXTURE_KEYS.openai;
    const output = redactSecrets(input);
    expect(output).not.toContain(FIXTURE_KEYS.openai);
    expect(output).toContain("[redacted]");
  });

  it("sk-ant-… (Anthropic) → [redacted]", () => {
    const output = redactSecrets("invalid x-api-key " + FIXTURE_KEYS.anthropic);
    expect(output).not.toContain(FIXTURE_KEYS.anthropic);
    expect(output).toContain("[redacted]");
  });

  it("AIza… (Gemini — pattern cũ chỉ /sk-/ đã LỠ, giờ khớp) → [redacted]", () => {
    const output = redactSecrets("API key not valid: " + FIXTURE_KEYS.gemini);
    expect(output).not.toContain(FIXTURE_KEYS.gemini);
    expect(output).toContain("[redacted]");
  });

  it("hex-32 (Azure) → [redacted]", () => {
    const output = redactSecrets("Access denied due to invalid api-key " + FIXTURE_KEYS.azure);
    expect(output).not.toContain(FIXTURE_KEYS.azure);
    expect(output).toContain("[redacted]");
  });

  it("văn bản thường KHÔNG bị đổi; nhiều key trong 1 chuỗi đều redact", () => {
    expect(redactSecrets("Không có bí mật ở đây.")).toBe("Không có bí mật ở đây.");
    const mixed = redactSecrets(FIXTURE_KEYS.openai + " và " + FIXTURE_KEYS.gemini + " và " + FIXTURE_KEYS.azure);
    expect(mixed).not.toContain(FIXTURE_KEYS.openai);
    expect(mixed).not.toContain(FIXTURE_KEYS.gemini);
    expect(mixed).not.toContain(FIXTURE_KEYS.azure);
  });

  it("key NHÚNG trong error message provider → AppError/params không chứa key (mô phỏng errmap)", () => {
    const providerMessage = "Error: key " + FIXTURE_KEYS.gemini + " is invalid";
    const sanitized = sanitizeProviderMessage(providerMessage);
    expect(sanitized).not.toContain(FIXTURE_KEYS.gemini);
    expect(sanitized).toContain("[redacted]");
  });
});

describe("sanitizeProviderMessage — cap 500 ký tự (§8.8)", () => {
  it("chuỗi > 500 ký tự bị cắt còn ≤ 500", () => {
    const long = "x".repeat(800);
    expect(sanitizeProviderMessage(long).length).toBeLessThanOrEqual(500);
  });

  it("gọn whitespace + redact trước khi trả về", () => {
    const output = sanitizeProviderMessage("line1\n  line2  with " + FIXTURE_KEYS.azure);
    expect(output).toBe("line1 line2 with [redacted]");
  });
});

describe("redactConfig — console.log có config không lộ apiKey (TDD §8.1 #4)", () => {
  it("apiKey → [redacted] (shallow copy, không đổi object gốc)", () => {
    const config = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };
    const redacted = redactConfig(config);
    expect(redacted.apiKey).toBe("[redacted]");
    expect(config.apiKey).toBe(FIXTURE_KEYS.openai); // bản gốc giữ nguyên (caller vẫn cần key để fetch)
  });
});
