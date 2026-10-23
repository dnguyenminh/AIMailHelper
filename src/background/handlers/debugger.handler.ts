// src/background/handlers/debugger.handler.ts — DEBUGGER_SCROLL/DEBUGGER_DETACH (UAT 18/10).
// Tab: LUÔN lấy từ sender.tab (router truyền vào) — KHÔNG nhận tabId từ payload (SR-12:
// attacker không thể bảo SW attach tab khác). Payload validate: số nguyên trong biên an toàn.
import { AppError } from "../../shared/errors";
import type { DebuggerScrollPayload } from "../../shared/messaging";
import { detachTab, registerDetachCleanup, scrollTab } from "../debugger-scroll";
import type { MessageRouter, RpcHandler } from "../router";

const MIN_DELTA = 200;
const MAX_DELTA = 5000;
const MAX_TIMES = 6;

function parseSenderTab(sender: unknown): { tabId: number; url: string | undefined } {
  const tab = (sender as { tab?: { id?: number; url?: string } } | undefined)?.tab;
  if (!tab || typeof tab.id !== "number") {
    throw new AppError("ERR-15", "errors.badRequest"); // chỉ CS trên tab thật được gọi
  }
  return { tabId: tab.id, url: tab.url };
}

function parseScrollPayload(payload: unknown): DebuggerScrollPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new AppError("ERR-15", "errors.badRequest");
    return n;
  };
  return {
    x: int(raw["x"], 0, 20_000),
    y: int(raw["y"], 0, 20_000),
    // uat86 — cho phép DẤU: âm = cuộn lên (trustedScrollToTop), dương = cuộn xuống; |delta| trong biên
    deltaY: (() => {
      const n = int(raw["deltaY"], -MAX_DELTA, MAX_DELTA);
      if (Math.abs(n) < MIN_DELTA) throw new AppError("ERR-15", "errors.badRequest");
      return n;
    })(),
    times: int(raw["times"], 1, MAX_TIMES)
  };
}

const scrollHandler: RpcHandler = async (payload, sender) => {
  const { tabId, url } = parseSenderTab(sender);
  const scroll = parseScrollPayload(payload);
  const sent = await scrollTab(tabId, url, scroll.x, scroll.y, scroll.deltaY, scroll.times);
  return { sent: sent };
};

const detachHandler: RpcHandler = async (_payload, sender) => {
  const { tabId } = parseSenderTab(sender);
  await detachTab(tabId);
  return { detached: true };
};

export function registerDebuggerHandlers(router: MessageRouter): void {
  registerDetachCleanup();
  router.register("DEBUGGER_SCROLL", scrollHandler);
  router.register("DEBUGGER_DETACH", detachHandler);
}
