// src/shared/queue-store.test.ts — hàng chờ auto-draft trên chrome.storage.local (TC-120; §7.4).
// (1) add → QueueItem shape (2) QUEUE_MAX 200 — item 201 từ chối + cảnh báo (3) update
// approved/rejected semantics (4) dữ liệu hỏng → lọc; set fail → ERR-08 (5) prune approved cũ.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToQueue, listQueue, QUEUE_KEY, QUEUE_MAX, updateQueueStatus } from "./queue-store";
import type { ChromeMock } from "../../tests/mocks/chrome";
import { createChromeMock } from "../../tests/mocks/chrome";
import type { QueueItem } from "./types";

type Chrome = { chrome: ChromeMock };
const cg = (): Chrome => globalThis as unknown as Chrome;
const seed = (items: QueueItem[]): Promise<void> => cg().chrome.storage.local.set({ [QUEUE_KEY]: items });
const item = (id: string, status: QueueItem["status"] = "pending"): QueueItem =>
  ({ id: id, messageId: "m-" + id, draft: "draft " + id, status: status, createdAt: new Date(2026, 0, 1).toISOString() });

beforeEach(async () => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
  await cg().chrome.storage.local.clear();
});

describe("queue-store (TC-120 — FR-GD6-04/06, TDD §7.4)", () => {
  it("thêm item → QueueItem {id, messageId, draft, status pending, createdAt}; listQueue đọc lại được", async () => {
    const added = await addToQueue({ messageId: "m1", draft: "Bản nháp" });
    expect(added).toMatchObject({ messageId: "m1", draft: "Bản nháp", status: "pending" });
    expect(added?.id).toMatch(/^queue_\d+_\d+$/);
    expect(new Date(added?.createdAt ?? "").toISOString()).toBe(added?.createdAt);
    expect(await listQueue()).toHaveLength(1);
  });

  it("TC-120 #1: QUEUE_MAX 200 — item thứ 201 KHÔNG thêm + console.warn cảnh báo (ERR-08)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let index = 0; index < QUEUE_MAX; index += 1) {
      expect(await addToQueue({ messageId: "m" + index, draft: "d" })).not.toBeNull();
    }
    expect(await addToQueue({ messageId: "m-overflow", draft: "d" })).toBeNull(); // item 201
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("QUEUE_MAX 200"));
    const items = await listQueue();
    expect(items).toHaveLength(QUEUE_MAX); // vẫn 200 — KHÔNG phình
    expect(items.every((entry) => entry.messageId !== "m-overflow")).toBe(true);
  });

  it("TC-120 #2/#3: update approved → giữ lại status approved; rejected → LOẠI khỏi hàng chờ; id lạ → null", async () => {
    const first = await addToQueue({ messageId: "m1", draft: "d1" });
    const second = await addToQueue({ messageId: "m2", draft: "d2" });
    expect(await updateQueueStatus(first?.id ?? "", "approved")).toMatchObject({ status: "approved" });
    expect(await updateQueueStatus(second?.id ?? "", "rejected")).toMatchObject({ status: "rejected" });
    const items = await listQueue();
    expect(items).toHaveLength(1); // rejected đã bị loại
    expect(items[0]).toMatchObject({ id: first?.id, status: "approved" }); // approved giữ để truy vết (§8.9)
    expect(await updateQueueStatus("queue_khongtonai", "approved")).toBeNull();
  });

  it("dữ liệu hỏng từ ngoài → lọc entry lạ; set fail → ERR-08", async () => {
    await seed([item("ok1"), { broken: true } as unknown as QueueItem, "strange" as unknown as QueueItem]);
    expect(await listQueue()).toEqual([item("ok1")]);
    cg().chrome.storage.local.failNextSet();
    await expect(addToQueue({ messageId: "m9", draft: "d" })).rejects.toMatchObject({ code: "ERR-08" });
  });

  it("prune: approved cũ nhất bị cắt khi non-pending vượt QUEUE_MAX (chặn phình storage — §7.4)", async () => {
    const old: QueueItem[] = [];
    for (let index = 0; index < QUEUE_MAX + 5; index += 1) old.push(item("a" + index, "approved"));
    await seed(old);
    await addToQueue({ messageId: "m-new", draft: "d" });
    const items = await listQueue();
    expect(items.filter((entry) => entry.status === "pending")).toHaveLength(1);
    expect(items.filter((entry) => entry.status !== "pending")).toHaveLength(QUEUE_MAX); // đã prune
  });
});
