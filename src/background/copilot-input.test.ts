// src/background/copilot-input.test.ts — uat58: hover/click chạy SONG SONG phải serialize
// (FIFO) — không bao giờ 2 attach({tabId}) chồng nhau → hết "Another debugger attached".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Calls = Array<{ op: string; key: string }>;

function installChrome(calls: Calls, delayMs: number): void {
  const fake = {
    debugger: {
      attach: (_target: { tabId: number }, _v: string, cb: () => void) => {
        setTimeout(() => { calls.push({ op: "attach", key: "tab" }); cb(); }, delayMs);
      },
      detach: (_target: { tabId: number }, cb: () => void) => {
        setTimeout(() => { calls.push({ op: "detach", key: "tab" }); cb(); }, delayMs);
      },
      sendCommand: (_target: { tabId: number }, method: string, _p: object, cb: () => void) => {
        setTimeout(() => { calls.push({ op: "cmd", key: method }); cb(); }, delayMs);
      }
    },
    runtime: { lastError: undefined as unknown }
  };
  (globalThis as { chrome?: unknown }).chrome = fake;
}

describe("copilot-input — FIFO serialize (uat58)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { chrome?: unknown }).chrome = undefined;
  });

  it("hover + click đồng thời → attach/detach KHÔNG chồng nhau (luân phiên)", async () => {
    const calls: Calls = [];
    installChrome(calls, 5);
    const { copilInputClick, copilInputHover } = await import("./copilot-input");
    const p1 = copilInputHover(109, { x: 100, y: 200 });
    const p2 = copilInputClick(109, { x: 300, y: 400 });
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    // bất biến: attach phải LUÔN đi với detach ngay trước attach kế tiếp (không 2 attach liền)
    let attached = 0;
    for (const c of calls) {
      if (c.op === "attach") {
        expect(attached).toBe(0); // đã có session đang mở → chồng!
        attached = 1;
      } else if (c.op === "detach") {
        attached = 0;
      }
    }
    expect(attached).toBe(0); // kết thúc: session đã gỡ sạch
    expect(calls.filter((c) => c.op === "attach").length).toBe(2);
  });
});
