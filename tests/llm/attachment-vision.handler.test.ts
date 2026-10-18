// tests/llm/attachment-vision.handler.test.ts — UAT 18/10: ATTACHMENT_VISION_TEXT handler.
// Payload validation logic tests (unit tests). Integration tests require full LLM runtime mocking.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerAttachmentHandlers } from "../../src/background/handlers/attachment.handler";
import { resetSessionsForTests } from "../../src/background/debugger-scroll";

const OWA_TAB = { id: 7, url: "https://outlook.cloud.microsoft/mail/inbox" };

function boot() {
  const router = new MessageRouter();
  registerAttachmentHandlers(router);
  return router;
}

async function callVision(router: any, payload: unknown, sender: unknown) {
  return router.handle({ kind: "ATTACHMENT_VISION_TEXT", requestId: "rpc_v", payload }, sender);
}

beforeEach(() => {
  const mock = createChromeMock() as any;
  mock.storage.sync.get = vi.fn(async () => ({ vision: { enabled: true, model: "qwen2.5-vl" } }));
  mock.debugger = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    sendCommand: vi.fn(async () => ({ text: "OCR result" })),
    getTargets: vi.fn((cb) => cb([
      { id: "frame1", type: "iframe", url: "https://word-view.officeapps.live.com/wv/wordviewerframe.aspx", attached: false },
      { id: "noise", type: "iframe", url: "https://outlook.cloud.microsoft/x", attached: false }
    ])),
    onDetach: { addListener: vi.fn() },
    onEvent: { addListener: vi.fn() }
  };
  (globalThis as any).chrome = mock;
  resetSessionsForTests();
  vi.restoreAllMocks();
});

describe("ATTACHMENT_VISION_TEXT — payload validation (UAT 18/10)", () => {
  it("payload rỗng → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: [] }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });

  it("file không có pages → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: [{ name: "a.docx", pages: [] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });

  it("file thiếu name → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: [{ name: "", pages: ["data:image/jpeg;base64,/9j/"] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });

  it("quá nhiều file (>3) → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: Array(5).fill({ name: "x.docx", pages: ["data:image/jpeg;base64,/9j/"] }) }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });

  it("payload không phải array → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: "not-array" }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });

  it("file thiếu name property → ERR-15", async () => {
    const r = boot();
    const response = await callVision(r, { files: [{ pages: ["data:image/jpeg;base64,/9j/"] }] }, { tab: OWA_TAB });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("ERR-15");
  });
});