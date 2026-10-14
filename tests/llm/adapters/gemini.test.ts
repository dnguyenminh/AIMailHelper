// tests/llm/adapters/gemini.test.ts — Gemini (FSD 5.2.4): header x-goog-api-key KHÔNG ?key= (BR-08),
// role "model", systemInstruction top-level, KHÔNG [DONE] (server close = done), SAFETY → ERR-15,
// 400 API_KEY_INVALID → ERR-02 vs INVALID_ARGUMENT → ERR-15 (DISC-2), listModels filter + strip prefix.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiAdapter } from "../../../src/shared/llm/adapters/gemini";
import { nthCall, errorResponse, FIXTURE_KEYS, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new GeminiAdapter();
const config = { provider: "gemini" as const, apiKey: FIXTURE_KEYS.gemini, model: "gemini-2.5-flash" };
const messages = [
  { role: "system" as const, content: "be brief" },
  { role: "user" as const, content: "email data" },
  { role: "assistant" as const, content: "draft 1" },
  { role: "user" as const, content: "email 2" }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiAdapter — request shape (5.2.4)", () => {
  it("chat: x-goog-api-key header; URL KHÔNG ?key=; systemInstruction; assistant → role model; gộp liên tiếp", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({
      candidates: [{ content: { parts: [{ text: "hi" }], role: "model" }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 512, candidatesTokenCount: 256, totalTokenCount: 768 }
    }));
    const response = await adapter.chat(config, messages);
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(call.url).not.toContain("key="); // BR-08 — key chỉ nằm trong header
    expect(call.headers["x-goog-api-key"]).toBe(FIXTURE_KEYS.gemini);
    expect(call.body["systemInstruction"]).toEqual({ parts: [{ text: "be brief" }] });
    expect(call.body["contents"]).toEqual([
      { role: "user", parts: [{ text: "email data" }] },
      { role: "model", parts: [{ text: "draft 1" }] },
      { role: "user", parts: [{ text: "email 2" }] }
    ]);
    expect(call.body["generationConfig"]).toEqual({ temperature: 0.3, maxOutputTokens: 2048 });
    expect(response.finishReason).toBe("stop"); // STOP → stop (NORMALIZE)
    expect(response.usage).toEqual({ inputTokens: 512, outputTokens: 256 });
  });

  it("chatStream: ?alt=sse; KHÔNG [DONE] — kết thúc khi server đóng connection", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Xin"}],"role":"model"}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" chào"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n'
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    const call = nthCall(mock, 0);
    expect(call.url).toContain(":streamGenerateContent?alt=sse");
    expect(deltas).toEqual(["Xin", " chào"]); // không cần [DONE] — stream hết data tự kết thúc
  });
});

describe("GeminiAdapter — error mapping (DISC-2) + SAFETY", () => {
  it("400 API_KEY_INVALID → ERR-02; 400 INVALID_ARGUMENT → ERR-15 (DISC-2)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key. " + FIXTURE_KEYS.gemini, status: "INVALID_ARGUMENT" } }));
    const e1 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-02" });
    expect(JSON.stringify(e1)).not.toContain(FIXTURE_KEYS.gemini); // BR-08/SR-03 — AIza pattern
    queueResponse(mock, errorResponse(400, { error: { code: 400, message: "Invalid JSON payload", status: "INVALID_ARGUMENT" } }));
    const e2 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-15" });
  });

  it("finishReason SAFETY → ERR-15 errors.safetyBlocked (không retry — 5.2.4)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ candidates: [{ content: { parts: [], role: "model" }, finishReason: "SAFETY" }] }));
    const error = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-15", i18nKey: "errors.safetyBlocked" });
  });

  it("429 RESOURCE_EXHAUSTED → ERR-03; 503 UNAVAILABLE → ERR-16", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" }] } }));
    const e1 = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-03", retryable: true });
    queueResponse(mock, errorResponse(503, { error: { code: 503, message: "overloaded", status: "UNAVAILABLE" } }));
    const e2 = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-16" });
  });
});

describe("GeminiAdapter — listModels (5.2.4)", () => {
  it("GET /v1beta/models → filter generateContent + strip prefix models/", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-2.5-pro" }
      ]
    }));
    const models = await adapter.listModels(config);
    expect(nthCall(mock, 0).url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(models).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]); // embed-only bị lọc; không có methods → giữ
  });
});

