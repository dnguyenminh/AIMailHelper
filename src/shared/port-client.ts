// src/shared/port-client.ts — PortClient (CS/popup/options): streaming qua Port "aimh:stream".
// TDD §3.4/§6.2: heartbeat ping 20s khi có stream active; cancel; onDisconnect reconnect 1 lần
// pre-first-chunk, post-chunk → ERR-07 giữ phần đã nhận; bỏ qua message trễ sau cancel/done.
import { nextRequestId, STREAM_PORT_NAME } from "./messaging";
import type { PortEvent, PortRequest, StreamRequestPayloads, StreamRequestKind } from "./messaging";

const HEARTBEAT_MS = 20_000;

export interface StreamHandle {
  cancel(): void;
}

export type StreamEventHandler = (event: PortEvent) => void;

interface ActiveStream {
  onEvent: StreamEventHandler;
  received: boolean;
  retried: boolean;
  nextSeq: number;
  gaps: number;
  payload: PortRequest;
}

export class PortClient {
  private port: chrome.runtime.Port | null = null;
  private active = new Map<string, ActiveStream>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  request<K extends StreamRequestKind>(kind: K, payload: StreamRequestPayloads[K], onEvent: StreamEventHandler): StreamHandle {
    const requestId = nextRequestId("req");
    // K correlating kind↔payload — cast an toàn do payload được ràng buộc bởi generic K.
    const message = { type: "request", requestId: requestId, kind: kind, payload: payload } as PortRequest;
    this.active.set(requestId, {
      onEvent: onEvent,
      received: false,
      retried: false,
      nextSeq: 0,
      gaps: 0,
      payload: message
    });
    this.ensurePort().postMessage(message);
    this.scheduleHeartbeat();
    return { cancel: () => this.cancel(requestId) };
  }

  cancel(requestId: string): void {
    // §6.2 #5: sau cancel — CS bỏ qua message trễ cho requestId đó.
    if (this.active.delete(requestId) && this.port) this.port.postMessage({ type: "cancel", requestId: requestId });
    this.stopHeartbeatWhenIdle();
  }

  disconnect(): void {
    this.port?.disconnect();
    this.port = null;
  }

  private ensurePort(): chrome.runtime.Port {
    if (this.port) return this.port;
    const port = chrome.runtime.connect({ name: STREAM_PORT_NAME });
    port.onMessage.addListener((event: unknown) => this.handleEvent(event));
    port.onDisconnect.addListener(() => this.handleDisconnect());
    this.port = port;
    return port;
  }

  private handleEvent(raw: unknown): void {
    const event = raw as PortEvent;
    const stream = this.active.get(event.requestId);
    if (!stream) return; // message trễ sau cancel/done — bỏ qua (§6.2 #3)
    if (event.type === "chunk") {
      if (event.seq !== stream.nextSeq) stream.gaps += 1; // seq chỉ VERIFY, không reorder (§2.5)
      stream.nextSeq = event.seq + 1;
      stream.received = true;
      stream.onEvent(event);
      return;
    }
    if (event.type === "done" && stream.gaps > 0) {
      console.warn("[AIMH][port] gaps detected on " + event.requestId + " — ERR-07-light, nội dung vẫn dùng"); // §6.2 #2
    }
    if (event.type === "done" || event.type === "error") {
      this.active.delete(event.requestId); // done/error là message CUỐI (§6.2 #3)
      this.stopHeartbeatWhenIdle();
    }
    stream.onEvent(event);
  }

  private handleDisconnect(): void {
    this.port = null;
    for (const [requestId, stream] of this.active.entries()) {
      if (!stream.received && !stream.retried) {
        // EF-7: CHƯA có chunk → tự reconnect + gửi lại đúng 1 lần (§2.5).
        stream.retried = true;
        this.ensurePort().postMessage(stream.payload);
        continue;
      }
      stream.onEvent({
        type: "error",
        requestId: requestId,
        code: "ERR-07",
        i18nKey: "errors.streamInterrupted",
        retryable: false
      });
      this.active.delete(requestId);
    }
    this.stopHeartbeatWhenIdle();
  }

  private scheduleHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.active.size === 0) {
        this.stopHeartbeatWhenIdle(); // không còn stream → ngừng ping để SW ngủ (§2.5)
        return;
      }
      this.port?.postMessage({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeatWhenIdle(): void {
    if (this.active.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
