// src/shared/port-server.ts — PortServer (SW): nhận PortRequest → stream handler map.
// TDD §3.4/§6.2: accepted trước chunk đầu; cancel → AbortController; done/error là message cuối.
// GĐ2: StreamContext mang requestId + send tự inject requestId (handler không lặp); chat-test cài ở stream.handler.
import { STREAM_PORT_NAME } from "./messaging";
import type { ErrCode } from "./errors";
import type { PortEvent, PortRequest, StreamRequestKind } from "./messaging";

// Event body handler gửi — requestId do PortServer inject (§6.2 #1).
export type StreamEventBody =
  | { type: "accepted" }
  | { type: "chunk"; seq: number; delta: string }
  | { type: "done"; finishReason?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; code: ErrCode; i18nKey: string; params?: Record<string, string>; retryable: boolean; httpStatus?: number }
  | { type: "progress"; done: number; total: number; failed: number };

export interface StreamContext {
  requestId: string;
  signal: AbortSignal;
  send: (event: StreamEventBody) => void;
}

export type StreamHandler = (payload: unknown, ctx: StreamContext) => Promise<void>;

export class PortServer {
  private handlers = new Map<StreamRequestKind, StreamHandler>();
  private aborts = new Map<string, AbortController>();

  register(kind: StreamRequestKind, handler: StreamHandler): void {
    this.handlers.set(kind, handler);
  }

  // Đăng ký listener đồng bộ (SW wake-by-event bắt buộc đăng ký top-level).
  attach(): void {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== STREAM_PORT_NAME) return;
      port.onMessage.addListener((message: unknown) => this.dispatch(port, message));
    });
  }

  private dispatch(port: chrome.runtime.Port, raw: unknown): void {
    const message = raw as PortRequest;
    if (message.type === "ping") return; // heartbeat — chỉ reset idle timer
    if (message.type === "cancel") {
      this.aborts.get(message.requestId)?.abort();
      this.aborts.delete(message.requestId);
      return;
    }
    void this.run(port, message.requestId, message.kind, message.payload);
  }

  private async run(port: chrome.runtime.Port, requestId: string, kind: StreamRequestKind, payload: unknown): Promise<void> {
    const send = (event: StreamEventBody): void => {
      port.postMessage({ ...event, requestId: requestId } as PortEvent);
    };
    const controller = new AbortController();
    this.aborts.set(requestId, controller);
    send({ type: "accepted" }); // §6.2 #1 — accepted trước chunk đầu
    const handler = this.handlers.get(kind);
    if (!handler) {
      send({ type: "error", code: "ERR-15", i18nKey: "errors.notImplemented", params: { phase: "GĐ3" }, retryable: false });
      this.aborts.delete(requestId);
      return;
    }
    try {
      await handler(payload, { requestId: requestId, signal: controller.signal, send: send });
    } catch (error) {
      console.error("[AIMH][port] stream handler failed:", kind, error); // KHÔNG log payload (BR-08)
    } finally {
      this.aborts.delete(requestId);
    }
  }
}
