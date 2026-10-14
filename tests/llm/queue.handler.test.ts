// tests/llm/queue.handler.test.ts — QUEUE_LIST/QUEUE_UPDATE qua MessageRouter thật + chrome mock
// (TC-211 — integration-lite như config.handler.test.ts). Validate BR-15: status lạ → ERR-15;
// id lạ → ERR-15. Chèn draft do content script thực hiện TRƯỚC khi gọi QUEUE_UPDATE — handler
// SW KHÔNG đụng DOM, KHÔNG có thao tác Send (BR-01 — audit TC-121 phủ lớp source).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerQueueHandlers } from "../../src/background/handlers/queue.handler";
import { addToQueue, listQueue } from "../../src/shared/queue-store";
import type { RpcResponse } from "../../src/shared/messaging";
import type { QueueItem } from "../../src/shared/types";

type Chrome = { chrome: ChromeMock };
const cg = (): Chrome => globalThis as unknown as Chrome;

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

function boot(): void {
  const router = new MessageRouter();
  registerQueueHandlers(router);
  router.listen();
}

async function rpc<T>(kind: string, payload: unknown, requestId: string): Promise<RpcResponse<T>> {
  return (await cg().chrome.runtime.sendMessage({ kind: kind, requestId: requestId, payload: payload })) as RpcResponse<T>;
}

const pendingIds = async (): Promise<string[]> => (await listQueue()).filter((item) => item.status === "pending").map((item) => item.id);

describe("QUEUE_LIST (§6.1 #7) — TC-211", () => {
  it("trả toàn bộ QueueItem trong hàng chờ; rỗng → []", async () => {
    boot();
    await addToQueue({ messageId: "m1", draft: "d1" });
    await addToQueue({ messageId: "m2", draft: "d2" });
    const response = await rpc<QueueItem[]>("QUEUE_LIST", {}, "r0");
    if (!response.ok) throw new Error("expected success");
    expect(response.data).toHaveLength(2);
    expect(response.data[0]).toMatchObject({ messageId: "m1", status: "pending" });

    await cg().chrome.storage.local.clear();
    const empty = await rpc<QueueItem[]>("QUEUE_LIST", {}, "r1");
    if (!empty.ok) throw new Error("expected success");
    expect(empty.data).toEqual([]);
  });
});

describe("QUEUE_UPDATE (§6.1 #8) — TC-211 (BR-15)", () => {
  it("#1 approved → ok + item status approved (việc chèn đã do content script làm trước đó)", async () => {
    boot();
    const id = (await pendingIds())[0] ?? (await addToQueue({ messageId: "m1", draft: "d1" }))?.id ?? "";
    const response = await rpc<{ ok: boolean }>("QUEUE_UPDATE", { id: id, status: "approved" }, "r2");
    if (!response.ok) throw new Error("expected success");
    expect(response.data).toEqual({ ok: true });
    expect((await listQueue()).find((item) => item.id === id)?.status).toBe("approved");
  });

  it("#2 rejected → item LOẠI khỏi hàng chờ", async () => {
    boot();
    const id = (await addToQueue({ messageId: "m1", draft: "d1" }))?.id ?? "";
    const response = await rpc<{ ok: boolean }>("QUEUE_UPDATE", { id: id, status: "rejected" }, "r3");
    expect(response.ok).toBe(true);
    expect((await listQueue()).filter((item) => item.id === id)).toHaveLength(0);
  });

  it("#3 status lạ ('sent') → ERR-15 (CHỈ nhận approved|rejected)", async () => {
    boot();
    const id = (await addToQueue({ messageId: "m1", draft: "d1" }))?.id ?? "";
    const response = await rpc<unknown>("QUEUE_UPDATE", { id: id, status: "sent" }, "r4");
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("ERR-15");
    expect((await listQueue())).toHaveLength(1); // dữ liệu không đổi
  });

  it("#4 id lạ / payload thiếu → ERR-15", async () => {
    boot();
    await addToQueue({ messageId: "m1", draft: "d1" });
    const unknown = await rpc<unknown>("QUEUE_UPDATE", { id: "queue_khongtonai", status: "approved" }, "r5");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("ERR-15");
    const missing = await rpc<unknown>("QUEUE_UPDATE", { status: "approved" }, "r6");
    if (!missing.ok) expect(missing.error.code).toBe("ERR-15");
  });
});
