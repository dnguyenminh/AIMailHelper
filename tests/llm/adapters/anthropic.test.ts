// tests/llm/adapters/anthropic.test.ts — Anthropic (FSD 5.2.3): transformation bắt buộc (system top-level,
// message đầu user, max_tokens required default 2048), 4 headers, SSE content_block_delta, 529 → ERR-16,
// listModels /v1/models phân trang. CORS spike CHƯA verify (Open Issue #2 — ghi chú).
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "../../../src/shared/llm/adapters/anthropic";
import { nthCall, errorResponse, FIXTURE_KEYS, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new AnthropicAdapter();
const config = { provider: "anthropic" as const, apiKey: FIXTURE_KEYS.anthropic, model: "claude-sonnet-4-5" };
const messages = [
  { role: "system" as const, content: "be helpful" },
  { role: "user" as const, content: "email data" }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnthropicAdapter — transformation bắt buộc (5.2.3)", () => {
  it("chat: system → top-level; messages đầu user; max_tokens default 2048; đủ 4 headers", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({
      content: [{ type: "text", text: "chào" }], stop_reason: "end_turn",
      usage: { input_tokens: 512, output_tokens: 256 }
    }));
    const response = await adapter.chat(config, messages);
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe(FIXTURE_KEYS.anthropic);
    expect(call.headers["anthropic-version"]).toBe("2023-06-01");
    expect(call.headers["anthropic-dangerous-direct-browser-access"]).toBe("true"); // thiếu → ERR-01 CORS
    expect(call.body["system"]).toBe("be helpful"); // KHÔNG nằm trong messages
    expect(call.body["max_tokens"]).toBe(2048); // BẮT BUỘC (#11)
    expect(call.body["messages"]).toEqual([{ role: "user", content: "email data" }]);
    expect(response.finishReason).toBe("stop"); // end_turn → stop (NORMALIZE)
    expect(response.usage).toEqual({ inputTokens: 512, outputTokens: 256 });
  });

  it("messages đầu là assistant → bọc vào 1 message user (5.2.3 #2)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }));
    await adapter.chat(config, [
      { role: "assistant" as const, content: "previous" },
      { role: "user" as const, content: "current" }
    ]);
    expect(nthCall(mock, 0).body["messages"]).toEqual([{ role: "user", content: "previous\n\ncurrent" }]);
  });
});

describe("AnthropicAdapter — SSE content_block_delta + lỗi", () => {
  it("chatStream: text_delta → deltas; ping/message_delta bỏ qua; end khi message_stop", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":512,"output_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Xin chào"}}\n\n',
      "event: ping\ndata: {\"type\":\"ping\"}\n\n",
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":256}}\n\n',
      "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    expect(deltas).toEqual(["Xin chào"]);
  });

  it("event error overloaded_error giữa stream → ERR-16 (529 — 5.2.3)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n'
    ]));
    const iterator = adapter.chatStream(config, messages)[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: "x", done: false });
    const error = await iterator.next().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-16", retryable: true });
  });

  it("HTTP 401 → ERR-02; HTTP 529 → ERR-16; 413 → ERR-15 tooLarge", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key " + FIXTURE_KEYS.anthropic } }));
    const e1 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-02" });
    expect(JSON.stringify(e1)).not.toContain(FIXTURE_KEYS.anthropic); // BR-08/SR-03
    queueResponse(mock, errorResponse(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    const e2 = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-16", retryable: true });
    queueResponse(mock, errorResponse(413, { type: "error", error: { type: "request_too_large", message: "too large" } }));
    const e3 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e3).toMatchObject({ code: "ERR-15", i18nKey: "errors.tooLarge" });
  });
});

describe("AnthropicAdapter — listModels phân trang (5.2.3)", () => {
  it("has_more=true → lấy tiếp after_id; gom data[].id", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ data: [{ type: "model", id: "claude-sonnet-4-5" }], has_more: true }));
    queueResponse(mock, jsonResponse({ data: [{ type: "model", id: "claude-haiku-4-5" }], has_more: false }));
    const models = await adapter.listModels(config);
    const first = nthCall(mock, 0);
    const second = nthCall(mock, 1);
    expect(first.url).toBe("https://api.anthropic.com/v1/models?limit=100");
    expect(second.url).toContain("after_id=claude-sonnet-4-5");
    expect(models).toEqual(["claude-sonnet-4-5", "claude-haiku-4-5"]);
  });
});

