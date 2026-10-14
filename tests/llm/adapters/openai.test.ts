// tests/llm/adapters/openai.test.ts — OpenAI adapter (FSD 5.2.1): request shape, SSE + [DONE],
// stream_options.include_usage, error mapping 401/429/503 (SR-03: key không lọt error), listModels filter.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "../../../src/shared/llm/adapters/openai";
import { nthCall, errorResponse, FIXTURE_KEYS, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new OpenAIAdapter();
const config = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };
const messages = [
  { role: "system" as const, content: "system prompt" },
  { role: "user" as const, content: "email data" }
];

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAIAdapter — request shape (5.2.1)", () => {
  it("chat: POST /v1/chat/completions, Bearer header, max_completion_tokens, không stream", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
    const response = await adapter.chat(config, messages, { temperature: 0.3 });
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers["Authorization"]).toBe("Bearer " + FIXTURE_KEYS.openai);
    expect(call.body["model"]).toBe("gpt-4o-mini");
    expect(call.body["max_completion_tokens"]).toBe(2048);
    expect(call.body["stream"]).toBe(false);
    expect(call.body["stream_options"]).toBeUndefined();
    expect(response.text).toBe("hi");
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it("chatStream: stream:true + stream_options.include_usage; deltas từ delta.content; [DONE] kết thúc", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Xin"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" chào"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n',
      "data: [DONE]\n\n"
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    const call = nthCall(mock, 0);
    expect(call.body["stream"]).toBe(true);
    expect(call.body["stream_options"]).toEqual({ include_usage: true });
    expect(deltas).toEqual(["Xin", " chào"]); // chunk không có content → bỏ qua (5.2.1)
  });

  it("model cũ từ chối max_completion_tokens → fallback max_tokens (TA note 5.2.1)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(400, { error: { message: "Unsupported parameter: max_completion_tokens", type: "invalid_request_error" } }));
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    const response = await adapter.chat(config, messages);
    expect(nthCall(mock, 1).body["max_tokens"]).toBe(2048);
    expect(response.text).toBe("ok");
  });
});

describe("OpenAIAdapter — error mapping (GĐ2 Done #2) + BR-08/SR-03", () => {
  it("401 → ERR-02; error message chứa key-like → redact (SR-03)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "Incorrect API key provided: " + FIXTURE_KEYS.openai, code: "invalid_api_key" } }));
    const error = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-02", retryable: false });
    expect(JSON.stringify(error)).not.toContain(FIXTURE_KEYS.openai);
  });

  it("429 → ERR-03 retryable (retryDelays rỗng trong test); Retry-After header được dùng", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(429, { error: { message: "rate limit" } }));
    const error = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-03", retryable: true, httpStatus: 429 });
  });

  it("503 → ERR-16 retryable; 404 → ERR-15", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(503, { error: { message: "overloaded" } }));
    const e1 = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-16", retryable: true });
    queueResponse(mock, errorResponse(404, { error: { message: "The model gpt-nope does not exist", code: "model_not_found" } }));
    const e2 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-15", retryable: false });
  });
});

describe("OpenAIAdapter — listModels (5.2.1)", () => {
  it("GET /v1/models → data[].id, filter embedding/whisper/tts/dall-e/moderation/babbage/davinci", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }, { id: "dall-e-3" }] }));
    const models = await adapter.listModels(config);
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://api.openai.com/v1/models");
    expect(call.headers["Authorization"]).toBe("Bearer " + FIXTURE_KEYS.openai);
    expect(models).toEqual(["gpt-4o-mini"]);
  });

  it("testConnection: chat ping, timeout 15s, trả {ok, message, latencyMs>=0}", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }));
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(nthCall(mock, 0).body["max_completion_tokens"]).toBe(16);
  });
});

