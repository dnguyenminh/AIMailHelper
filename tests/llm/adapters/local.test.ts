// tests/llm/adapters/local.test.ts — Local LLM Ollama/LM Studio (FSD 5.2.6; Open Issue #1 chốt SSE).
// Preset ollama :11434 → chat /v1/chat/completions + listModels /api/tags (models[].name);
// lmstudio :1234/v1 → chat /chat/completions + listModels /models; KHÔNG Authorization; 403 → ERR-05.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAdapter } from "../../../src/shared/llm/adapters/local";
import { nthCall, errorResponse, jsonResponse, queueResponse, sseResponse, stubFetch } from "../helpers";

const adapter = new LocalAdapter();
const messages = [{ role: "user" as const, content: "email data" }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LocalAdapter — Ollama preset (5.2.6)", () => {
  const config = { provider: "local" as const, model: "llama3.2:latest", local: { url: "http://localhost:11434", preset: "ollama" as const } };

  it("chat: POST {url}/v1/chat/completions; KHÔNG Authorization; KHÔNG apiKey trong header", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "chào" }, finish_reason: "stop" }] }));
    const response = await adapter.chat(config, messages);
    const call = nthCall(mock, 0);
    expect(call.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(call.headers["Authorization"]).toBeUndefined(); // 5.2.6 — không cần key
    expect(call.body["model"]).toBe("llama3.2:latest");
    expect(response.text).toBe("chào");
  });

  it("chatStream: SSE + [DONE] (openai-compatible làm chính — Open Issue #1)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[{"delta":{"content":"Xin"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" chào"}}]}\n\n',
      "data: [DONE]\n\n"
    ]));
    const deltas: string[] = [];
    for await (const delta of adapter.chatStream(config, messages)) deltas.push(delta);
    expect(deltas).toEqual(["Xin", " chào"]);
  });

  it("listModels: GET {url}/api/tags → models[].name (llama3.2:latest dùng thẳng làm model)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ models: [{ name: "llama3.2:latest" }, { name: "qwen2.5:7b" }] }));
    await expect(adapter.listModels(config)).resolves.toEqual(["llama3.2:latest", "qwen2.5:7b"]);
    expect(nthCall(mock, 0).url).toBe("http://localhost:11434/api/tags");
  });

  it("403 thiếu OLLAMA_ORIGINS → ERR-05 + hint env; fetch TypeError → ERR-05 (không ERR-01)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(403, { error: "Forbidden" }));
    const e1 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "ERR-05", i18nKey: "errors.localOriginsHint" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const e2 = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(e2).toMatchObject({ code: "ERR-05", i18nKey: "errors.localProviderUnreachable" });
  });
});

describe("LocalAdapter — LM Studio preset (5.2.6)", () => {
  const config = { provider: "local" as const, model: "qwen2.5-7b-instruct", local: { url: "http://localhost:1234/v1", preset: "lmstudio" as const } };

  it("chat: url đã có /v1 → nối thẳng /chat/completions", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    await adapter.chat(config, messages);
    expect(nthCall(mock, 0).url).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("listModels: GET {url}/models → data[].id", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ data: [{ id: "qwen2.5-7b-instruct" }] }));
    await expect(adapter.listModels(config)).resolves.toEqual(["qwen2.5-7b-instruct"]);
    expect(nthCall(mock, 0).url).toBe("http://localhost:1234/v1/models");
  });

  it("404 model chưa pull → ERR-15 gợi ý lệnh pull (5.2.6)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(404, { error: { message: "model 'llama3.2' not found, try pulling it first" } }));
    const error = await adapter.chat(config, messages).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ERR-15" });
    expect(JSON.stringify(error)).toContain("pulling");
  });
});

