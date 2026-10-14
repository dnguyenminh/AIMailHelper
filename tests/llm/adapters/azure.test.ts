// tests/llm/adapters/azure.test.ts — Azure OpenAI (FSD 5.2.2): header api-key (KHÔNG Bearer),
// body KHÔNG có trường model, deployment trong path, content_filter → thông báo riêng, KHÔNG listModels (BR-17).
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureAdapter } from "../../../src/shared/llm/adapters/azure";
import { nthCall, errorResponse, FIXTURE_KEYS, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new AzureAdapter();
const config = {
  provider: "azure" as const,
  apiKey: FIXTURE_KEYS.azure,
  model: "gpt-4o",
  azure: { endpoint: "https://myres.openai.azure.com", deployment: "gpt-4o-deploy", apiVersion: "2024-10-21" }
};
const messages = [{ role: "user" as const, content: "email data" }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AzureAdapter — request shape (5.2.2)", () => {
  it("chat: header api-key, endpoint/deployment/api-version trong path, body KHÔNG model, max_tokens", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "xin" }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3 } }));
    const response = await adapter.chat(config, messages, { maxTokens: 512 });
    const call = nthCall(mock, 0);
    expect(call.url).toBe("https://myres.openai.azure.com/openai/deployments/gpt-4o-deploy/chat/completions?api-version=2024-10-21");
    expect(call.headers["api-key"]).toBe(FIXTURE_KEYS.azure);
    expect(call.headers["Authorization"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(call.body, "model")).toBe(false); // deployment trong path
    expect(call.body["max_tokens"]).toBe(512);
    expect(response.text).toBe("xin");
    expect(response.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });

  it("chatStream: SSE + [DONE]; chunk đầu prompt_filter_results (không delta) bỏ qua", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[],"prompt_filter_results":[]}\n\n',
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      "data: [DONE]\n\n"
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    expect(deltas).toEqual(["A"]);
  });

  it("finish_reason content_filter → ERR-15 errors.contentFilter (5.2.2)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }));
    const error = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-15", i18nKey: "errors.contentFilter" });
  });
});

describe("AzureAdapter — error mapping + listModels", () => {
  it("401/403 → ERR-02; 404 deployment sai → ERR-15; 429 → ERR-03", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "Access denied due to invalid api-key " + FIXTURE_KEYS.azure } }));
    const e1 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-02" });
    expect(JSON.stringify(e1)).not.toContain(FIXTURE_KEYS.azure); // SR-03 redact hex-32
    queueResponse(mock, errorResponse(404, { error: { message: "Deployment not found" } }));
    const e2 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-15" });
    queueResponse(mock, errorResponse(429, { error: { message: "rate limit" } }));
    const e3 = await adapter.chat(config, messages, { retryDelays: [] }).catch((e: unknown) => e);
    expect(e3).toMatchObject({ code: "ERR-03", retryable: true });
  });

  it("KHÔNG listModels (BR-17) — gọi → ERR-15 modelsNotSupported (UI ẩn nút fetch)", async () => {
    await expect(adapter.listModels(config)).rejects.toMatchObject({ code: "ERR-15", i18nKey: "errors.modelsNotSupported" });
  });
});

