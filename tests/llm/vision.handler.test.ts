// tests/llm/vision.handler.test.ts — IT: VISION_CAPTURE + VISION_LOCATE (T3; TC-125; BR-03 lớp 3).
// vision.enabled=false (mặc định BR-03) → VISION_CAPTURE từ chối + captureVisibleTab = 0 call;
// enabled → đúng 1 capture; VISION_LOCATE → adapter.chat với ChatOptions.visionImage, temp 0.
// Ảnh KHÔNG persist (không key storage nào xuất hiện — §8.7).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { storage } from "../../src/shared/storage";
import { MessageRouter } from "../../src/background/router";
import { registerVisionHandlers } from "../../src/background/handlers/vision.handler";
import { jsonResponse, FIXTURE_KEYS, firstCall, queueResponse, stubFetch } from "./helpers";

import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock };

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };
const REQUEST = { functionKey: "reply-button", question: "nút Reply", imageBase64: "QUJDRA==", mediaType: "image/jpeg" };

async function bootRouter(): Promise<MessageRouter> {
  const router = new MessageRouter();
  registerVisionHandlers(router);
  return router;
}

function captureSpy(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => "data:image/jpeg;base64,REFUQQ==");
  (chrome.tabs as unknown as { captureVisibleTab: unknown }).captureVisibleTab = spy;
  return spy;
}

async function call(router: MessageRouter, kind: string, payload: unknown): Promise<RpcResponse<unknown>> {
  return router.handle({ kind: kind, requestId: "rpc_test", payload: payload }) as Promise<RpcResponse<unknown>>;
}

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

describe("VISION_CAPTURE — BR-03 lớp 3 (SW gate cuối)", () => {
  it("vision tắt (mặc định) → ERR-15 + captureVisibleTab = 0 call (TC-125 #1)", async () => {
    const spy = captureSpy();
    const router = await bootRouter();
    const response = await call(router, "VISION_CAPTURE", {});
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
    expect(spy).not.toHaveBeenCalled();
  });

  it("vision bật → đúng 1 capture + trả dataURL; KHÔNG persist (storage không có key ảnh)", async () => {
    const spy = captureSpy();
    await storage.setVision({ enabled: true });
    const router = await bootRouter();
    const response = await call(router, "VISION_CAPTURE", {});
    expect(response.ok).toBe(true);
    expect((response as { data: { dataUrl: string } }).data.dataUrl).toContain("data:image/jpeg;base64,");
    expect(spy).toHaveBeenCalledTimes(1);
    const dump = (chrome.storage.sync as unknown as { dump(): Map<string, unknown> }).dump();
    for (const key of Array.from(dump.keys())) {
      expect(String(key)).not.toContain("image"); // ảnh không được ghi xuống storage (§8.7)
    }
  });
});

describe("VISION_LOCATE — adapter GĐ2 nhận visionImage qua ChatOptions", () => {
  it("gọi chat temp 0 + maxTokens 64 + trả text model (parse point ở content)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    await storage.setVision({ enabled: true });
    const router = await bootRouter();
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "(42%, 8%)" }, finish_reason: "stop" }] }));
    const response = await call(router, "VISION_LOCATE", REQUEST);
    expect(response.ok).toBe(true);
    expect((response as { data: { text: string } }).data.text).toBe("(42%, 8%)");
    const body = firstCall(mock).body;
    expect(body["temperature"]).toBe(0); // deterministic — tọa độ (§15.2 #6)
    expect(body["max_completion_tokens"]).toBe(64); // OpenAI GĐ2: max_completion_tokens (fallback max_tokens)
  });

  it("payload thiếu imageBase64 → ERR-15 (validate biên — §8.8)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    const router = await bootRouter();
    const response = await call(router, "VISION_LOCATE", { functionKey: "reply-button" });
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
  });

  it("chưa cấu hình provider → ERR-11 (EF-4 — error envelope, KHÔNG crash SW)", async () => {
    await storage.setVision({ enabled: true });
    const router = await bootRouter();
    const response = await call(router, "VISION_LOCATE", REQUEST);
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-11");
  });
});
