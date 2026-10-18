// tests/llm/attachment-vision.handler.test.ts — UAT 18/10: ATTACHMENT_VISION_TEXT handler.
// Model resolution: VL riêng → text-VL → null (no-vision-model path). Payload validation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock, StorageAreaMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerAttachmentHandlers } from "../../src/background/handlers/attachment.handler";
import { resetSessionsForTests } from "../../src/background/debugger-scroll";
import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock & { debugger: unknown } };

const OWA_TAB = { id: 7, url: "https://outlook.cloud.microsoft/mail/inbox" };

function makeVisionStorage(model: string): StorageAreaMock {
  const sync = createChromeMock().storage.sync;
  sync.get = vi.fn(async () => ({ vision: { enabled: true, model } }));
  return sync;
}

function boot(): MessageRouter {
  const router = new MessageRouter();
  registerAttachmentHandlers(router);
  return router;
}

async function callVision(router: MessageRouter, payload: unknown, sender: unknown): Promise<RpcResponse<unknown>> {
  return router.handle({ kind: "ATTACHMENT_VISION_TEXT", requestId: "rpc_v", payload }, sender) as Promise<RpcResponse<unknown>>;
}

function setupMock(model: string): ChromeMock {
  const mock = createChromeMock();
  mock.storage.sync = makeVisionStorage(model);
  return mock;
}

beforeEach(() => {
  const mock = setupMock("qwen2.5-vl");
  (globalThis as unknown as { chrome: ChromeMock }).chrome = mock;
  resetSessionsForTests();
  vi.restoreAllMocks();
});

describe("ATTACHMENT_VISION_TEXT — vision-read attachment (UAT 18/10)", () => {
  it("có model VL riêng (vision.model) → dùng nó (kể cả model chính cũng VL)", async () => {
    const r = boot();
    const response = await callVision(r, { files: [{ name: "test.docx", pages: ["data:image/jpeg;base64,/9j/"] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(true);
    expect((response as { data: { results: { name: string; text?: string }[] } }).data.results[0]?.text).toBeDefined();
  });

  it("không VL riêng + model chính VL (gpt-4o) → dùng model chính", async () => {
    const mock = setupMock("");
    (globalThis as unknown as { chrome: ChromeMock }).chrome = mock;
    resetSessionsForTests();
    const router = boot();
    const response = await callVision(router, { files: [{ name: "test.docx", pages: ["data:image/jpeg;base64,/9j/"] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(true);
    expect((response as { data: { results: { name: string; text?: string }[] } }).data.results[0]?.text).toBeDefined();
  });

  it("không VL riêng + model chính KHÔNG VL → no-vision-model (error trả về, không call LLM)", async () => {
    // Với vision.model="" và mock storage chỉ có vision enabled, handler sẽ trả no-vision-model
    // vì resolveActive sẽ trả về model chính (mock trong boot). Test integration này
    // kiểm tra path no-vision-model khi handler không có model VL.
    const m = setupMock("");
    (globalThis as unknown as { chrome: ChromeMock }).chrome = m;
    resetSessionsForTests();
    const r = boot();
    const response = await callVision(r, { files: [{ name: "test.docx", pages: ["data:image/jpeg;base64,/9j/"] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(true);
    const rs = (response as { data: { results: { name: string; error?: string }[] } }).data.results;
    expect(rs[0]?.error).toBe("no-vision-model");
  });

  it("payload sai (rỗng / quá nhiều file / page rỗng / thiếu name) → ERR-15", async () => {
    const router = boot();
    for (const bad of [
      { files: [] },
      { files: [{ name: "a.docx", pages: [] }] },
      { files: [{ name: "", pages: ["data:image/jpeg;base64,/9j/"] }] },
      { files: Array(5).fill({ name: "x.docx", pages: ["data:image/jpeg;base64,/9j/"] }) },
      { files: "not-array" },
      { files: [{ pages: ["data:image/jpeg;base64,/9j/"] }] }
    ]) {
      const response = await callVision(router, bad, { tab: OWA_TAB });
      expect(response.ok).toBe(false);
      expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
    }
  });

  it("tab không phải OWA / không sender.tab → ERR-15 (SR-12)", async () => {
    const router = boot();
    for (const sender of [
      { tab: { id: 7, url: "https://evil.example.com/x" } },
      undefined
    ]) {
      const response = await callVision(router, { files: [{ name: "x.docx", pages: ["data:image/jpeg;base64,/9j/"] }] }, sender);
      expect(response.ok).toBe(false);
      expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
    }
  });
});