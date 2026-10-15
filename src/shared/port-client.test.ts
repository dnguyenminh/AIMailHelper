// src/shared/port-client.test.ts — UT PortClient: heartbeat/seq-gap/reconnect (STC TC-124 + TC-208).
// Gap Critical P6 2026-10-15: module này trước đó chỉ được IT phủ happy-path (stream/analyze/reply/
// triage handlers) — heartbeat 20s, ERR-07-light seq gap, reconnect pre-first-chunk 1x, ERR-07
// post-chunk giữ phần đã nhận chưa có test trực tiếp nào (TDD §3.4/§6.2/§2.5).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../../tests/mocks/chrome";
import type { PortEvent, PortRequest } from "./messaging";
import { PortClient } from "./port-client";

interface ServerPortMock {
  onMessage: { addListener(fn: (message: unknown) => void): void };
  postMessage(message: unknown): void;
  disconnect(): void;
}

interface ServerEntry {
  port: ServerPortMock;
  received: unknown[];
}

const CHAT_PAYLOAD = { messages: [{ role: "user" as const, content: "ping" }] };

function boot(): ServerEntry[] {
  const chromeMock = createChromeMock();
  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  const servers: ServerEntry[] = [];
  chromeMock.runtime.onConnect.addListener((raw) => {
    const port = raw as ServerPortMock;
    const received: unknown[] = [];
    port.onMessage.addListener((message) => received.push(message));
    servers.push({ port: port, received: received });
  });
  return servers;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function requestIdOf(received: unknown[]): string {
  const first = received[0] as PortRequest | undefined;
  expect(first?.type).toBe("request");
  return (first as { requestId: string }).requestId;
}

function chunk(requestId: string, seq: number, delta: string): PortEvent {
  return { type: "chunk", requestId: requestId, seq: seq, delta: delta };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PortClient — heartbeat + lifecycle (STC TC-124: FR-GD2-04, FSD 5.3.1)", () => {
  it("#1 heartbeat ping 20s/20s khi stream active (TC-124 #1)", async () => {
    vi.useFakeTimers();
    const servers = boot();
    const client = new PortClient();
    client.request("chat-test", CHAT_PAYLOAD, () => undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    const pings = servers[0]?.received.filter((m) => (m as PortRequest).type === "ping") ?? [];
    expect(pings).toHaveLength(2);
    client.disconnect();
    vi.useRealTimers();
  });

  it("#2 done → ngừng ping để SW ngủ (TC-124 #2)", async () => {
    vi.useFakeTimers();
    const servers = boot();
    const client = new PortClient();
    client.request("chat-test", CHAT_PAYLOAD, () => undefined);
    await flush();
    const server = servers[0] as ServerEntry;
    const id = requestIdOf(server.received);
    server.port.postMessage({ type: "done", requestId: id });
    await flush();
    await vi.advanceTimersByTimeAsync(45_000);
    const pings = server.received.filter((m) => (m as PortRequest).type === "ping");
    expect(pings).toHaveLength(0);
    client.disconnect();
    vi.useRealTimers();
  });

  it("#3 message trễ sau cancel → CS bỏ qua, onEvent không được gọi (TC-124 #3)", async () => {
    const servers = boot();
    const client = new PortClient();
    const events: PortEvent[] = [];
    client.request("chat-test", CHAT_PAYLOAD, (event) => events.push(event));
    await flush();
    const server = servers[0] as ServerEntry;
    const id = requestIdOf(server.received);
    client.cancel(id);
    await flush();
    server.port.postMessage(chunk(id, 0, "trễ sau cancel"));
    await flush();
    expect(events).toHaveLength(0);
    client.disconnect();
  });

  it("#4 seq gap (0 rồi 2) → done kèm cảnh báo ERR-07-light, events vẫn đầy đủ (TC-124 #4)", async () => {
    const servers = boot();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new PortClient();
    const events: PortEvent[] = [];
    client.request("chat-test", CHAT_PAYLOAD, (event) => events.push(event));
    await flush();
    const server = servers[0] as ServerEntry;
    const id = requestIdOf(server.received);
    server.port.postMessage(chunk(id, 0, "một"));
    server.port.postMessage(chunk(id, 2, "ba")); // thiếu seq 1 — gap
    server.port.postMessage({ type: "done", requestId: id });
    await flush();
    expect(events.map((e) => e.type)).toEqual(["chunk", "chunk", "done"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ERR-07-light"));
    client.disconnect();
  });

  it("message trễ sau done → bỏ qua (done là message cuối — §6.2 #3)", async () => {
    const servers = boot();
    const client = new PortClient();
    const events: PortEvent[] = [];
    client.request("chat-test", CHAT_PAYLOAD, (event) => events.push(event));
    await flush();
    const server = servers[0] as ServerEntry;
    const id = requestIdOf(server.received);
    server.port.postMessage({ type: "done", requestId: id });
    await flush();
    server.port.postMessage(chunk(id, 0, "sau done"));
    await flush();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("done");
    client.disconnect();
  });
});

describe("PortClient — onDisconnect (STC TC-208: FSD 5.3.1, UC-01 EF-7, ERR-07)", () => {
  it("#1 disconnect TRƯỚC chunk đầu → reconnect đúng 1 lần + gửi lại nguyên văn (TC-208 #1)", async () => {
    const servers = boot();
    const client = new PortClient();
    const events: PortEvent[] = [];
    client.request("chat-test", CHAT_PAYLOAD, (event) => events.push(event));
    await flush();
    const first = servers[0] as ServerEntry;
    const original = first.received[0] as Extract<PortRequest, { type: "request" }>;
    first.port.disconnect();
    await flush();
    expect(servers).toHaveLength(2); // đúng 1 lần reconnect
    const resent = (servers[1] as ServerEntry).received[0] as Extract<PortRequest, { type: "request" }>;
    expect(resent.requestId).toBe(original.requestId); // nguyên văn — cùng requestId/kind/payload
    expect(resent.kind).toBe(original.kind);
    expect(resent.payload).toEqual(original.payload);
    expect(events.some((e) => e.type === "error")).toBe(false);
    client.disconnect();
  });

  it("#2 disconnect SAU 2 chunk → ERR-07 giữ phần đã nhận, KHÔNG tự gửi lại (TC-208 #2)", async () => {
    const servers = boot();
    const client = new PortClient();
    const events: PortEvent[] = [];
    client.request("chat-test", CHAT_PAYLOAD, (event) => events.push(event));
    await flush();
    const server = servers[0] as ServerEntry;
    const id = requestIdOf(server.received);
    server.port.postMessage(chunk(id, 0, "phần 1"));
    server.port.postMessage(chunk(id, 1, "phần 2"));
    await flush();
    server.port.disconnect();
    await flush();
    const error = events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }> | undefined;
    expect(error?.code).toBe("ERR-07");
    expect(error?.i18nKey).toBe("errors.streamInterrupted");
    expect(events.filter((e) => e.type === "chunk")).toHaveLength(2); // giữ phần đã nhận
    expect(servers).toHaveLength(1); // không reconnect — không nhân đôi request
    client.disconnect();
  });
});
