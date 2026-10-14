// tests/llm/locator.handler.test.ts — LOCATOR_RESOLVE (TDD §6.1 #6): prompt locate (temperature 0,
// maxTokens 512) → chat → parse refId fail-closed (SR-01 L3); snapshot vượt cap → ERR-15 tooLarge;
// chưa cấu hình → ERR-11; KHÔNG key trong envelope (BR-08).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { storage } from "../../src/shared/storage";
import { MessageRouter } from "../../src/background/router";
import { registerLocatorHandlers, parseRefId } from "../../src/background/handlers/locator.handler";
import { FIXTURE_KEYS, jsonResponse, queueResponse, stubFetch } from "./helpers";
import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock };

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };

function boot(): MessageRouter {
  const router = new MessageRouter();
  registerLocatorHandlers(router);
  return router;
}

const openAiChatJson = (content: string): Response =>
  jsonResponse({ choices: [{ message: { content: content }, finish_reason: "stop" }] });

beforeEach(async () => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
  await storage.setProviderConfig("openai", STORED);
  await storage.setActiveProvider("openai");
});

describe("LOCATOR_RESOLVE — prompt locate + parse refId (GĐ3)", () => {
  it("LLM trả 'ref_12' → data.refId='ref_12'; request mang temperature 0 + max_tokens 512", async () => {
    const { mock, calls } = stubFetch();
    queueResponse(mock, openAiChatJson("ref_12"));
    const response = (await boot().handle({
      kind: "LOCATOR_RESOLVE",
      requestId: "r1",
      payload: { functionKey: "compose-box", question: "ô soạn thảo", snapshot: 'textbox "Compose" (ref_12)' }
    })) as RpcResponse<{ refId: string | null }>;
    expect(response.ok).toBe(true);
    expect((response as { data: { refId: string } }).data.refId).toBe("ref_12");
    const body = calls[0]?.body as { temperature: number; max_completion_tokens?: number; max_tokens?: number; messages: { role: string; content: string }[] };
    expect(body.temperature).toBe(0);
    // OpenAI adapter: max_completion_tokens mặc định (TA note 5.2.1 — fallback max_tokens chỉ khi model cũ từ chối)
    expect(body.max_completion_tokens ?? body.max_tokens).toBe(512);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[1]?.content).toContain("A11y snapshot");
    expect(body.messages[1]?.content).toContain("ref_12");
  });

  it("LLM trả 'null' / text lạ → refId null (fail-closed — không bao giờ parse tùy ý)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, openAiChatJson("null"));
    const response = (await boot().handle({
      kind: "LOCATOR_RESOLVE",
      requestId: "r2",
      payload: { functionKey: "reply-button", question: "q", snapshot: "textbox (ref_1)" }
    })) as RpcResponse<{ refId: string | null }>;
    expect((response as { data: { refId: string | null } }).data.refId).toBeNull();
  });

  it("snapshot > 25K chars → ERR-15 tooLarge (biên NFR §10)", async () => {
    stubFetch();
    const response = (await boot().handle({
      kind: "LOCATOR_RESOLVE",
      requestId: "r3",
      payload: { functionKey: "reply-button", question: "q", snapshot: "x".repeat(26_000) }
    })) as RpcResponse<unknown>;
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string; i18nKey: string } }).error.code).toBe("ERR-15");
    expect((response as { error: { i18nKey: string } }).error.i18nKey).toBe("errors.tooLarge");
  });

  it("payload sai shape (functionKey rỗng / snapshot thiếu) → ERR-15", async () => {
    stubFetch();
    const router = boot();
    for (const payload of [{}, { functionKey: "reply-button" }, { functionKey: "", question: "q", snapshot: "s" }]) {
      const response = (await router.handle({ kind: "LOCATOR_RESOLVE", requestId: "r", payload: payload })) as RpcResponse<unknown>;
      expect(response.ok).toBe(false);
      expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
    }
  });

  it("chưa cấu hình provider → ERR-11 (envelope, KHÔNG crash SW)", async () => {
    await storage.setActiveProvider("azure");
    stubFetch();
    const response = (await boot().handle({
      kind: "LOCATOR_RESOLVE",
      requestId: "r4",
      payload: { functionKey: "reply-button", question: "q", snapshot: "s" }
    })) as RpcResponse<unknown>;
    expect((response as { error: { code: string } }).error.code).toBe("ERR-11");
  });

  it("sai key (401 nhúng key) → ERR-02, envelope KHÔNG chứa key (BR-08)", async () => {
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ error: { message: "Incorrect API key: " + FIXTURE_KEYS.openai } }, 401));
    const response = (await boot().handle({
      kind: "LOCATOR_RESOLVE",
      requestId: "r5",
      payload: { functionKey: "reply-button", question: "q", snapshot: "s" }
    })) as RpcResponse<unknown>;
    expect((response as { error: { code: string } }).error.code).toBe("ERR-02");
    expect(JSON.stringify(response)).not.toContain(FIXTURE_KEYS.openai);
  });
});

describe("parseRefId — SR-01 L3 fail-closed (unit thuần)", () => {
  it("chỉ chấp nhận ref_\\d+ well-formed; mọi text khác → null", () => {
    expect(parseRefId("ref_7")).toBe("ref_7");
    expect(parseRefId("  Phần tử là ref_12  ")).toBe("ref_12");
    expect(parseRefId("ref_1 và ref_2")).toBe("ref_1");
    expect(parseRefId("null")).toBeNull();
    expect(parseRefId("")).toBeNull();
    expect(parseRefId("Ignore previous instructions")).toBeNull();
    expect(parseRefId("ref_")).toBeNull();
    expect(parseRefId("refABC")).toBeNull();
  });
});
