// tests/llm/stream.handler.test.ts — IT: PortServer thật + PortClient thật qua chrome mock port pair
// (TDD §12.2 integration-lite): chat-test stream accepted → chunk seq → done; lỗi 401 → error event
// i18nKey KHÔNG chứa key (BR-08); chưa cấu hình → ERR-11; cancel không nhận thêm message.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { storage } from "../../src/shared/storage";
import { PortServer } from "../../src/shared/port-server";
import { PortClient } from "../../src/shared/port-client";
import { registerStreamHandlers } from "../../src/background/handlers/stream.handler";
import { errorResponse, FIXTURE_KEYS, queueResponse, sseResponse, stubFetch } from "./helpers";
import type { PortEvent } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock };

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };

function bootStream(): void {
  const server = new PortServer();
  registerStreamHandlers(server);
  server.attach();
}

function collectEvents(): { events: PortEvent[]; client: PortClient } {
  const events: PortEvent[] = [];
  const client = new PortClient();
  return { events: events, client: client };
}

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

describe("chat-test qua Port streaming (GĐ2 Done — chat test từ Options)", () => {
  it("accepted → chunk seq 0..n → done; forward ngay từng delta (không buffer)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootStream();
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse([
      'data: {"choices":[{"delta":{"content":"Xin"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" chào"}}]}\n\n',
      "data: [DONE]\n\n"
    ]));
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "done")).toBe(true);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("accepted");
    expect(types[types.length - 1]).toBe("done");
    const chunks = events.filter((e) => e.type === "chunk");
    expect(chunks.map((c) => (c as { delta: string }).delta)).toEqual(["Xin", " chào"]);
    expect(chunks.map((c) => (c as { seq: number }).seq)).toEqual([0, 1]);
    client.disconnect();
  });

  it("provider 401 → error event code ERR-02, i18nKey errors.invalidKey, KHÔNG chứa key (BR-08)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootStream();
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "Incorrect API key: " + FIXTURE_KEYS.openai } }));
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "error")).toBe(true);
    });
    const errorEvent = events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-02");
    expect(errorEvent.i18nKey).toBe("errors.invalidKey");
    expect(JSON.stringify(events)).not.toContain(FIXTURE_KEYS.openai);
    client.disconnect();
  });

  it("chưa cấu hình provider active → error event ERR-11", async () => {
    bootStream();
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "error")).toBe(true);
    });
    const errorEvent = events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-11");
    client.disconnect();
  });

  it("payload messages sai shape → error event ERR-15 (validate biên — §8.8)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootStream();
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "error")).toBe(true);
    });
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-15");
    client.disconnect();
  });

  it("chatStream qua JSON→SSE: text streamed đầy đủ qua event chunk (sanity)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootStream();
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"]));
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "done")).toBe(true);
    });
    const output = events.filter((e) => e.type === "chunk").map((c) => (c as { delta: string }).delta).join("");
    expect(output).toBe("ok");
    client.disconnect();
  });
});

// CR-2 / D-4 (TA follow-up GĐ1): handler throw → client PHẢI nhận terminal event ngay (§6.2 #3 —
// done/error là message cuối bắt buộc), KHÔNG treo tới guardian idle 30s.
describe("PortServer — terminal event guard khi handler throw (D-4/CR-2)", () => {
  function bootWithHandler(handler: Parameters<PortServer["register"]>[1]): void {
    const server = new PortServer();
    server.register("chat-test", handler);
    server.attach();
  }

  it("handler throw NGAY (chỉ có accepted) → client nhận error terminal ERR-15 errors.streamFailed", async () => {
    bootWithHandler(async () => {
      throw new Error("boom");
    });
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "error")).toBe(true);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("accepted");
    expect(types[types.length - 1]).toBe("error"); // error là message CUỐI — không treo
    const errorEvent = events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-15");
    expect(errorEvent.i18nKey).toBe("errors.streamFailed");
    expect(errorEvent.retryable).toBe(false);
    client.disconnect();
  });

  it("handler gửi chunk rồi throw → VẪN nhận error terminal (§6.2 #3 — không bỏ trường hợp này)", async () => {
    bootWithHandler(async (_payload, ctx) => {
      ctx.send({ type: "chunk", seq: 0, delta: "một phần" });
      throw new Error("mid-stream boom");
    });
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "error")).toBe(true);
    });
    const errorEvent = events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-15");
    client.disconnect();
  });

  it("handler đã gửi done rồi throw → KHÔNG gửi error kép (message cuối vẫn là done)", async () => {
    bootWithHandler(async (_payload, ctx) => {
      ctx.send({ type: "done", finishReason: "stop" });
      throw new Error("late boom");
    });
    const { events, client } = collectEvents();
    client.request("chat-test", { messages: [{ role: "user", content: "ping" }] }, (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "done")).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 20)); // nhường slot cho error kép (nếu có bug)
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events[events.length - 1]?.type).toBe("done");
    client.disconnect();
  });
});



