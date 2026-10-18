// tests/llm/debugger.handler.test.ts — UAT 18/10: DEBUGGER_SCROLL/DETACH qua chrome.debugger.
// Bảo mật bắt buộc: (1) tab LUÔN từ sender.tab (không tin tabId payload); (2) whitelist CDP —
// CHỈ Input.synthesizeScrollGesture, KHÔNG Runtime.evaluate; (3) chặn tab ngoài domain OWA;
// (4) payload ngoài biên → ERR-15; (5) attach 1 lần cho nhiều scroll; DETACH gỡ sạch.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerDebuggerHandlers } from "../../src/background/handlers/debugger.handler";
import { resetSessionsForTests } from "../../src/background/debugger-scroll";

import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock & { debugger: DebuggerMock } };

interface DebuggerMock {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  onDetach: { addListener: ReturnType<typeof vi.fn> };
}

const OWA_TAB = { id: 7, url: "https://outlook.cloud.microsoft/mail/inbox" };
const OWA_TAB_HTTPS_OK = { id: 7, url: "https://outlook.cloud.microsoft/mail/inbox" };

function mockDebugger(): DebuggerMock {
  const mock: DebuggerMock = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    sendCommand: vi.fn(async () => undefined),
    onDetach: { addListener: vi.fn() }
  };
  return mock;
}

function boot(): MessageRouter {
  const router = new MessageRouter();
  registerDebuggerHandlers(router);
  return router;
}

async function call(router: MessageRouter, kind: string, payload: unknown, sender: unknown): Promise<RpcResponse<unknown>> {
  return router.handle({ kind: kind, requestId: "rpc_test", payload: payload }, sender as chrome.runtime.MessageSender) as Promise<RpcResponse<unknown>>;
}

const SCROLL_OK = { x: 240, y: 650, deltaY: 1200, times: 2 };

beforeEach(() => {
  const mock = createChromeMock() as ChromeMock & { debugger: DebuggerMock };
  mock.debugger = mockDebugger();
  (globalThis as unknown as Chrome).chrome = mock;
  resetSessionsForTests();
  vi.restoreAllMocks();
});

describe("DEBUGGER_SCROLL — trusted-scroll (UAT 18/10, SPIKE §7.1)", () => {
  it("tab OWA từ sender → attach đúng 1 lần + sendCommand CHỈ Input.synthesizeScrollGesture", async () => {
    const router = boot();
    const response = await call(router, "DEBUGGER_SCROLL", SCROLL_OK, { tab: OWA_TAB });
    expect(response.ok).toBe(true);
    expect((response as { data: { sent: number } }).data.sent).toBe(2);
    const dbg = (globalThis as unknown as Chrome).chrome.debugger;
    expect(dbg.attach).toHaveBeenCalledTimes(1);
    expect(dbg.attach.mock.calls[0]?.[0]).toEqual({ tabId: 7 });
    expect(dbg.sendCommand).toHaveBeenCalledTimes(2);
    for (const cmdCall of dbg.sendCommand.mock.calls) {
      expect(cmdCall[1]).toBe("Input.synthesizeScrollGesture"); // whitelist — không command khác
      expect(cmdCall[0]).toEqual({ tabId: 7 });
    }
  });

  it("tabId từ payload BỊ BỎ QUA — luôn dùng sender.tab (SR-12 chống attach tab khác)", async () => {
    const router = boot();
    await call(router, "DEBUGGER_SCROLL", { ...SCROLL_OK, tabId: 999 }, { tab: OWA_TAB });
    const dbg = (globalThis as unknown as Chrome).chrome.debugger;
    expect(dbg.attach.mock.calls[0]?.[0]).toEqual({ tabId: 7 }); // sender tab — không phải 999
  });

  it("tab KHÔNG phải OWA → ERR-15, không attach", async () => {
    const router = boot();
    const response = await call(router, "DEBUGGER_SCROLL", SCROLL_OK, { tab: { id: 7, url: "https://evil.example.com/mail" } });
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
    expect((globalThis as unknown as Chrome).chrome.debugger.attach).not.toHaveBeenCalled();
  });

  it("payload ngoài biên (deltaY 50 / times 99 / x âm) → ERR-15, 0 sendCommand", async () => {
    const router = boot();
    for (const bad of [ { x: 240, y: 650, deltaY: 50, times: 2 }, { x: 240, y: 650, deltaY: 1200, times: 99 }, { x: -5, y: 650, deltaY: 1200, times: 2 } ]) {
      const response = await call(router, "DEBUGGER_SCROLL", bad, { tab: OWA_TAB_HTTPS_OK });
      expect(response.ok).toBe(false);
    }
    expect((globalThis as unknown as Chrome).chrome.debugger.sendCommand).not.toHaveBeenCalled();
  });

  it("lần 2 không attach lại (session giữ) + DETACH gỡ đúng tab", async () => {
    const router = boot();
    await call(router, "DEBUGGER_SCROLL", SCROLL_OK, { tab: OWA_TAB });
    await call(router, "DEBUGGER_SCROLL", SCROLL_OK, { tab: OWA_TAB });
    const dbg = (globalThis as unknown as Chrome).chrome.debugger;
    expect(dbg.attach).toHaveBeenCalledTimes(1);
    const detachResponse = await call(router, "DEBUGGER_DETACH", {}, { tab: OWA_TAB });
    expect(detachResponse.ok).toBe(true);
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 7 });
    await call(router, "DEBUGGER_SCROLL", SCROLL_OK, { tab: OWA_TAB });
    expect(dbg.attach).toHaveBeenCalledTimes(2); // detach xong → lần sau attach lại
  });

  it("sendCommand không có sender.tab (SW nội bộ) → ERR-15", async () => {
    const router = boot();
    const response = await call(router, "DEBUGGER_SCROLL", SCROLL_OK, undefined);
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
  });
});
