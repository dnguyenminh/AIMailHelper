// tests/llm/connection.handler.test.ts — integration-lite qua MessageRouter thật (GĐ2; TDD §12.2):
// TEST_CONNECTION → {ok, message, latencyMs}; 401 → error envelope ERR-02 KHÔNG chứa key (BR-08/SR-03);
// LIST_MODELS tolerant; merge key đã lưu khi payload để trống (BR-08 — key không qua UI);
// chưa cấu hình → ERR-11; azure listModels → modelsNotSupported (BR-17); ERR-14 khi thiếu permission.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerConnectionHandlers } from "../../src/background/handlers/connection.handler";
import { storage } from "../../src/shared/storage";
import { nthCall, errorResponse, FIXTURE_KEYS, jsonResponse, queueResponse, stubFetch } from "./helpers";

type Chrome = { chrome: ChromeMock };

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

function newRouter(): MessageRouter {
  const router = new MessageRouter();
  registerConnectionHandlers(router);
  return router;
}

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };

describe("TEST_CONNECTION (§6.1 #4)", () => {
  it("ok → data {ok:true, message, latencyMs} qua error-free envelope; fetch Bearer key đã merge", async () => {
    await storage.setProviderConfig("openai", STORED);
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }));
    const response = await newRouter().handle({
      kind: "TEST_CONNECTION", requestId: "r1",
      payload: { config: { provider: "openai", apiKey: "", model: "gpt-4o-mini" } } // key trống → merge stored
    });
    if (!response.ok) throw new Error("expected success, got " + JSON.stringify(response.error));
    expect(response.data).toMatchObject({ ok: true, latencyMs: expect.any(Number) });
    expect(nthCall(mock, 0).headers["Authorization"]).toBe("Bearer " + FIXTURE_KEYS.openai);
  });

  it("sai key (401) → error envelope ERR-02; JSON envelope KHÔNG chứa key (BR-08/SR-03)", async () => {
    await storage.setProviderConfig("openai", STORED);
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "Incorrect API key: " + FIXTURE_KEYS.openai } }));
    const response = await newRouter().handle({ kind: "TEST_CONNECTION", requestId: "r2", payload: { config: { provider: "openai", apiKey: "", model: "gpt-4o-mini" } } });
    expect(response.ok).toBe(false);
    expect(JSON.stringify(response)).not.toContain(FIXTURE_KEYS.openai);
    if (!response.ok) expect(response.error.code).toBe("ERR-02");
  });

  it("chưa lưu config + payload không đủ trường → ERR-15 (validate biên §8.8 — model rỗng bị từ chối)", async () => {
    const response = await newRouter().handle({ kind: "TEST_CONNECTION", requestId: "r3", payload: { config: { provider: "openai", apiKey: "", model: "" } } });
    if (response.ok) throw new Error("expected failure");
    expect(response.error.code).toBe("ERR-15");
  });

  it("openai-compatible chưa cấp optional permission → ERR-14 (BR-05, §8.3)", async () => {
    (globalThis as unknown as Chrome).chrome.permissions.contains = async () => false;
    const response = await newRouter().handle({
      kind: "TEST_CONNECTION", requestId: "r4",
      payload: { config: { provider: "openai-compatible", apiKey: "", baseUrl: "http://localhost:4000/v1", model: "m" } }
    });
    if (response.ok) throw new Error("expected failure");
    expect(response.error.code).toBe("ERR-14");
  });
});

describe("LIST_MODELS (§6.1 #5) — tolerant; fail không chặn lưu (BR-17 phía UI)", () => {
  it("ok → {models:[...]}; azure → ERR-15 modelsNotSupported", async () => {
    await storage.setProviderConfig("openai", STORED);
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }] }));
    const ok = await newRouter().handle({ kind: "LIST_MODELS", requestId: "r5", payload: { config: { provider: "openai", apiKey: "", model: "gpt-4o-mini" } } });
    if (!ok.ok) throw new Error("expected success, got " + JSON.stringify(ok.error));
    expect(ok.data).toEqual({ models: ["gpt-4o-mini"] });

    await storage.setProviderConfig("azure", { provider: "azure", apiKey: FIXTURE_KEYS.azure, model: "d", azure: { endpoint: "https://r.openai.azure.com", deployment: "d", apiVersion: "2024-10-21" } });
    const azure = await newRouter().handle({ kind: "LIST_MODELS", requestId: "r6", payload: { config: { provider: "azure", apiKey: "", model: "d" } } });
    if (azure.ok) throw new Error("expected failure");
    expect(azure.error.i18nKey).toBe("errors.modelsNotSupported");
  });
});



