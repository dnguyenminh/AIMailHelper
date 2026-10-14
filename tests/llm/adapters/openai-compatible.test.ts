// tests/llm/adapters/openai-compatible.test.ts — OpenAI-compatible tolerant (FSD 5.2.5):
// connection close = end (không cần [DONE]); dòng JSON hỏng bỏ qua; apiKey optional (KHÔNG gửi
// Authorization rỗng); listModels tolerant {data[]}/{models[]} id??name??model.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleAdapter } from "../../../src/shared/llm/adapters/openai-compatible";
import { nthCall, errorResponse, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new OpenAICompatibleAdapter();
const messages = [
  { role: "system" as const, content: "s" },
  { role: "user" as const, content: "u" }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleAdapter — tolerant SSE (5.2.5)", () => {
  const config = { provider: "openai-compatible" as const, apiKey: "sk-or-abc123def456ghi789", baseUrl: "https://openrouter.ai/api/v1", model: "vendor/model-x" };

  it("chat: Authorization Bearer khi có key; max_tokens; body giống OpenAI", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    const response = await adapter.chat(config, messages);
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call.headers["Authorization"]).toBe("Bearer sk-or-abc123def456ghi789");
    expect(call.body["max_tokens"]).toBe(2048);
    expect(response.text).toBe("ok");
  });

  it("server KHÔNG gửi [DONE] → connection close = kết thúc bình thường", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[{"delta":{"content":"một"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" hai"}}]}\n\n'
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    expect(deltas).toEqual(["một", " hai"]);
  });

  it("dòng JSON hỏng → bỏ qua dòng đó, KHÔNG fail toàn bộ stream (5.2.5)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
      "data: {không phải json}\n\n",
      "data: [truncated line không parse được\n\n",
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n'
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    expect(deltas).toEqual(["a", "b"]);
  });
});

describe("OpenAICompatibleAdapter — apiKey optional (5.2.5 headers)", () => {
  it("apiKey rỗng → KHÔNG gửi Authorization header (một số server trả 401 khi thấy header rỗng)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    const noKey = { provider: "openai-compatible" as const, baseUrl: "http://localhost:4000/v1", model: "m" };
    await adapter.chat(noKey, messages);
    expect(nthCall(mock, 0).headers["Authorization"]).toBeUndefined();
  });
});

describe("OpenAICompatibleAdapter — tolerant listModels (5.2.5)", () => {
  it("shape {data:[{id}]} → data[].id", async () => {
    const { mock } = stubFetch();
    const config = { provider: "openai-compatible" as const, baseUrl: "https://openrouter.ai/api/v1", model: "m" };
    queueResponse(mock, jsonResponse({ data: [{ id: "m1" }, { id: "m2" }] }));
    await expect(adapter.listModels(config)).resolves.toEqual(["m1", "m2"]);
    expect(nthCall(mock, 0).url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("shape {models:[{name}]} → models[].name; item id ?? name ?? model", async () => {
    const { mock } = stubFetch();
    const config = { provider: "openai-compatible" as const, baseUrl: "https://proxy.example.com/api/v1", model: "m" };
    queueResponse(mock, jsonResponse({ models: [{ name: "alpha" }, { model: "beta" }] }));
    await expect(adapter.listModels(config)).resolves.toEqual(["alpha", "beta"]);
  });

  it("lỗi HTTP map theo status: 401→ERR-02, 5xx→ERR-16, status lạ→ERR-15 kèm detail redact", async () => {
    const { mock } = stubFetch();
    const config = { provider: "openai-compatible" as const, baseUrl: "https://proxy.example.com/api/v1", model: "m" };
    queueResponse(mock, errorResponse(401, { message: "bad key sk-zzz1234567890abcdef" }));
    const e1 = await adapter.listModels(config).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-02" });
    expect(JSON.stringify(e1)).not.toContain("sk-zzz1234567890abcdef");
    queueResponse(mock, errorResponse(502, { message: "bad gateway" }));
    // listModels không nhận opts → override retryDelaysConfig (listModels luôn retry 5xx theo mặc định)
    const { retryDelaysConfig } = await import("../../../src/shared/llm/call");
    const saved = [...retryDelaysConfig.delays5xx];
    retryDelaysConfig.delays5xx = [];
    try {
      const e2 = await adapter.listModels(config).catch((e: unknown) => e);
      expect(e2).toMatchObject({ code: "ERR-16", retryable: true });
    } finally {
      retryDelaysConfig.delays5xx = saved;
    }
  });
});

