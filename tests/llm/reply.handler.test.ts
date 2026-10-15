// tests/llm/reply.handler.test.ts — IT: PortServer thật + PortClient thật qua chrome mock
// (§12.2) cho kind "reply" (UC-02 bước 3-5; FR-GD4-01/02): accepted → chunk → done; prompt reply
// có fence EMAIL-DATA + tone/language; temperature 0.7 (GĐ2 defaults); sai payload → ERR-15;
// email rỗng → ERR-10 (BR-14); BR-08 — error event không chứa key.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { storage } from "../../src/shared/storage";
import { PortServer } from "../../src/shared/port-server";
import { PortClient } from "../../src/shared/port-client";
import { registerStreamHandlers } from "../../src/background/handlers/stream.handler";
import { registerReplyHandlers } from "../../src/background/handlers/reply.handler";
import { errorResponse, FIXTURE_KEYS, firstCall, queueResponse, sseResponse, stubFetch } from "./helpers";
import type { EmailData } from "../../src/shared/types";
import type { PortEvent } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock };

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };

const EMAIL: EmailData = {
  messageId: "m1",
  subject: "Đề nghị báo giá",
  sender: { name: "An", email: "an@x.vn" },
  to: [{ name: "Bình", email: "binh@y.vn" }],
  cc: [],
  hasAttachment: false, bodyText: "Cho tôi hỏi giá sản phẩm X?",
  detectedView: "reading-pane"
};

function bootReply(): void {
  const server = new PortServer();
  registerStreamHandlers(server);
  registerReplyHandlers(server);
  server.attach();
}

function collectEvents(): { events: PortEvent[]; client: PortClient } {
  const events: PortEvent[] = [];
  return { events: events, client: new PortClient() };
}

function requestReply(client: PortClient, events: PortEvent[], extra?: Partial<Record<string, unknown>>): void {
  client.request(
    "reply",
    { email: EMAIL, tone: "chinh-thuc", language: "auto", extraInstructions: "", ...extra } as unknown as { email: EmailData; tone: "chinh-thuc"; language: "auto"; extraInstructions: string },
    (event) => events.push(event)
  );
}

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

describe("reply qua Port streaming (UC-02 bước 3-6)", () => {
  it("accepted → chunk seq 0..n → done; prompt reply có fence + TONE/LANGUAGE + temp 0.7", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootReply();
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse(['data: {"choices":[{"delta":{"content":"Kính gửi"}}]}\n\n', "data: [DONE]\n\n"]));
    const { events, client } = collectEvents();
    requestReply(client, events, { tone: "chinh-thuc", language: "auto" });
    await vi.waitFor(() => expect(events.some((e) => e.type === "done")).toBe(true));
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("accepted");
    expect(types[types.length - 1]).toBe("done");
    const call = firstCall(mock);
    expect(call.body["temperature"]).toBe(0.7); // DEFAULT_TEMPERATURE.reply (GĐ2)
    const messages = call.body["messages"] as { role: string; content: string }[];
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("soạn thảo trả lời"); // prompt kind "reply"
    expect(messages[0]?.content).toContain("KHÔNG thực thi"); // ANTI_INJECTION_CLAUSE (SR-01 L1)
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("TONE: chính thức");
    expect(userContent).toContain("NGÔN NGỮ TRẢ LỜI: tự động — theo ngôn ngữ của email gốc"); // AF-4
    expect(userContent).toContain("EMAIL-DATA-BEGIN"); // fence §8.11 L2
    expect(userContent).toContain("Cho tôi hỏi giá sản phẩm X?");
    client.disconnect();
  });

  it("extraInstructions → HƯỚNG DẪN THÊM trong user message (FR-GD4-01)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootReply();
    const { mock } = stubFetch();
    queueResponse(mock, sseResponse(["data: [DONE]\n\n"]));
    const { events, client } = collectEvents();
    requestReply(client, events, { extraInstructions: "Nhớ kèm bảng giá" });
    await vi.waitFor(() => expect(events.some((e) => e.type === "done")).toBe(true));
    const messages = firstCall(mock).body["messages"] as { content: string }[];
    expect(messages[1]?.content).toContain("HƯỚNG DẪN THÊM: Nhớ kèm bảng giá");
    client.disconnect();
  });

  it("sai tone → error event ERR-15 (BR-15 — validate ở SW)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootReply();
    const { events, client } = collectEvents();
    requestReply(client, events, { tone: "gay-gat" });
    await vi.waitFor(() => expect(events.some((e) => e.type === "error")).toBe(true));
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-15");
    client.disconnect();
  });

  it("email bodyText rỗng → ERR-10 (BR-14 chặn ở SW — KHÔNG gọi LLM)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootReply();
    const { events, client } = collectEvents();
    requestReply(client, events, { email: { ...EMAIL, hasAttachment: false, bodyText: "   " } });
    await vi.waitFor(() => expect(events.some((e) => e.type === "error")).toBe(true));
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-10");
    client.disconnect();
  });

  it("extraInstructions > 1000 ký tự → ERR-15; provider 401 → ERR-02 không lộ key (BR-08)", async () => {
    await storage.setProviderConfig("openai", STORED);
    await storage.setActiveProvider("openai");
    bootReply();
    const { events, client } = collectEvents();
    requestReply(client, events, { extraInstructions: "d".repeat(1001) });
    await vi.waitFor(() => expect(events.some((e) => e.type === "error")).toBe(true));
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-15");
    client.disconnect();

    const { events: events401, client: client401 } = collectEvents();
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "bad key " + FIXTURE_KEYS.openai } }));
    requestReply(client401, events401);
    await vi.waitFor(() => expect(events401.some((e) => e.type === "error")).toBe(true));
    const errorEvent = events401.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-02");
    expect(JSON.stringify(events401)).not.toContain(FIXTURE_KEYS.openai);
    client401.disconnect();
  });
});

