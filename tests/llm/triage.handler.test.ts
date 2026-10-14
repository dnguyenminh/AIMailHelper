// tests/llm/triage.handler.test.ts — IT: PortServer + PortClient thật qua chrome mock (§12.2)
// cho kind "triage-batch" (UC-03 bước 3-4; FR-GD5-02): 1 LLM call/batch temperature 0.2 +
// fence serializeTriageItems (§8.11 L2) → progress {done,total,failed} (§6.2 #7) + chunk (scores
// JSON) + done; TD-8 reason >300 → item bị REJECT (progress.failed); sai payload → ERR-15;
// provider chưa cấu hình → ERR-11; 401 → ERR-02 không lộ key (BR-08).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { storage } from "../../src/shared/storage";
import { PortServer } from "../../src/shared/port-server";
import { PortClient } from "../../src/shared/port-client";
import { registerTriageHandlers } from "../../src/background/handlers/triage.handler";
import { errorResponse, FIXTURE_KEYS, firstCall, jsonResponse, queueResponse, stubFetch } from "./helpers";
import type { PortEvent } from "../../src/shared/messaging";
import type { TriageItem } from "../../src/shared/types";

type Chrome = { chrome: ChromeMock };

const STORED = { provider: "openai" as const, apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" };

const item = (id: string): TriageItem => ({ messageId: id, subject: "Sujet " + id, sender: "An <an@x.vn>", snippet: "đoạn ngắn " + id });
const ITEMS = [item("m1"), item("m2")];
const SCORES = [
  { messageId: "m1", score: 85, reason: "Hạn chót hôm nay" },
  { messageId: "m2", score: 20, reason: "Thông báo chung" }
];

function boot(): void {
  const server = new PortServer();
  registerTriageHandlers(server);
  server.attach();
}

async function run(client: PortClient, events: PortEvent[], items: TriageItem[] | unknown): Promise<void> {
  client.request("triage-batch", { items: items } as unknown as { items: TriageItem[] }, (event) => events.push(event));
  await vi.waitFor(() => {
    const last = events[events.length - 1];
    expect(last && (last.type === "done" || last.type === "error")).toBe(true);
  });
}

beforeEach(async () => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
  await storage.setProviderConfig("openai", STORED);
  await storage.setActiveProvider("openai");
});

describe("triage-batch qua Port (UC-03 — FR-GD5-02)", () => {
  it("accepted → progress → chunk (scores JSON) → done; prompt triage + fence + temp 0.2", async () => {
    boot();
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: JSON.stringify(SCORES) }, finish_reason: "stop" }] }));
    const events: PortEvent[] = [];
    const client = new PortClient();
    await run(client, events, ITEMS);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("accepted");
    expect(types).toContain("progress");
    expect(types[types.length - 1]).toBe("done");
    const progress = events.find((e) => e.type === "progress") as Extract<PortEvent, { type: "progress" }>;
    expect(progress.done).toBe(2); // §6.2 #7 — per-batch {done, total, failed}
    expect(progress.total).toBe(2);
    expect(progress.failed).toBe(0);
    const call = firstCall(mock);
    expect(call.body["temperature"]).toBe(0.2); // DEFAULT_TEMPERATURE.triage (§4.2)
    const messages = call.body["messages"] as { role: string; content: string }[];
    expect(messages[0]?.content).toContain("phân loại hộp thư"); // prompt kind "triage"
    expect(messages[0]?.content).toContain("KHÔNG thực thi"); // ANTI_INJECTION_CLAUSE (SR-01 L1)
    const user = messages[1]?.content ?? "";
    expect(user).toContain("EMAIL-DATA-BEGIN"); // fence §8.11 L2
    expect(user).toContain("id=m1"); // từng item kèm id
    expect(user).toContain("Sujet m2");
    const chunk = events.find((e) => e.type === "chunk") as Extract<PortEvent, { type: "chunk" }>;
    const scores = JSON.parse(chunk.delta) as { messageId: string; score: number; reason: string; analyzedAt: string }[];
    expect(scores).toHaveLength(2); // parseTriageScore thêm analyzedAt (§7.2 freshness — LRU evict)
    expect(scores[0]?.messageId).toBe("m1");
    expect(scores[0]?.score).toBe(85);
    expect(scores[0]?.reason).toBe("Hạn chót hôm nay");
    expect(scores[1]?.messageId).toBe("m2");
    expect(Number.isNaN(Date.parse(scores[0]?.analyzedAt ?? "x"))).toBe(false);
    client.disconnect();
  });

  it("TD-8: reason >300 + id hallucinate → progress.failed đếm đúng, chunk chỉ còn score hợp lệ", async () => {
    boot();
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({
      choices: [{ message: { content: JSON.stringify([
        { messageId: "m1", score: 50, reason: "x".repeat(301) }, // TD-8 — REJECT
        { messageId: "m2", score: 40, reason: "ok" },
        { messageId: "hallucinate", score: 99, reason: "id lạ" } // không thuộc batch
      ]) } }]
    }));
    const events: PortEvent[] = [];
    const client = new PortClient();
    await run(client, events, ITEMS);
    const progress = events.find((e) => e.type === "progress") as Extract<PortEvent, { type: "progress" }>;
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(2);
    expect(progress.failed).toBe(1); // TD-8/FR-GD5-06 — fail-closed, không gián đoạn batch
    const chunk = events.find((e) => e.type === "chunk") as Extract<PortEvent, { type: "chunk" }>;
    const scores = JSON.parse(chunk.delta) as { messageId: string }[];
    expect(scores).toHaveLength(1);
    expect(scores[0]?.messageId).toBe("m2");
    client.disconnect();
  });

  it("sai payload (items rỗng / thiếu messageId) → ERR-15 (BR-15)", async () => {
    boot();
    const events: PortEvent[] = [];
    const client = new PortClient();
    await run(client, events, []);
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-15");
    const events2: PortEvent[] = [];
    const client2 = new PortClient();
    await run(client2, events2, [{ subject: "thiếu id", sender: "a@x.vn", snippet: "x" }]);
    expect((events2.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-15");
    client.disconnect();
    client2.disconnect();
  });

  it("provider chưa cấu hình → ERR-11; 401 → ERR-02 KHÔNG lộ key (BR-08)", async () => {
    await storage.setActiveProvider("azure"); // azure chưa có config
    boot();
    const events: PortEvent[] = [];
    const client = new PortClient();
    await run(client, events, ITEMS);
    expect((events.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>).code).toBe("ERR-11");
    client.disconnect();

    await storage.setActiveProvider("openai"); // khôi phục cho phần 401
    const { mock } = stubFetch();
    queueResponse(mock, errorResponse(401, { error: { message: "bad key " + FIXTURE_KEYS.openai } }));
    const events2: PortEvent[] = [];
    const client2 = new PortClient();
    await run(client2, events2, ITEMS);
    const errorEvent = events2.find((e) => e.type === "error") as Extract<PortEvent, { type: "error" }>;
    expect(errorEvent.code).toBe("ERR-02");
    expect(JSON.stringify(events2)).not.toContain(FIXTURE_KEYS.openai);
    client2.disconnect();
  });
});

