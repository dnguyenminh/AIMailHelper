// src/content/modules/automode-approve.test.ts — UC-07 approve/reject orchestration
// (TC-120 #2/#3, TC-211; FR-GD6-04/05): approve → chèn qua actions (BR-01 — chỉ chèn, KHÔNG
// Send) · EF-5 mismatch giữ pending · EF-2 về pending + ERR-09 · AF-5 approve all một phần
// lỗi + needs-confirm · reject loại khỏi hàng chờ.
import { describe, expect, it, vi } from "vitest";
import type { InsertOutcome } from "../owa-adapter/actions";
import { booted, DRAFT_TEXT, lastState, makeHarness, onlyItem, queueItem, settled } from "./automode-testkit";

describe("AutoModeQueue — approve/reject (TC-120 #2/#3, TC-211; UC-07)", () => {
  it("pending → approved → chèn luồng hoàn chỉnh: insertDraft spy + status approved (BR-01 — chỉ chèn)", async () => {
    const insertSpy = vi.fn(async (): Promise<InsertOutcome> => ({ kind: "inserted" }));
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] }, insertImpl: insertSpy });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    const outcome = await controller.approve(onlyItem(harness).id);
    expect(outcome).toEqual({ kind: "approved" });
    expect(insertSpy).toHaveBeenCalledWith(DRAFT_TEXT, undefined); // chèn draft — KHÔNG bấm Send
    expect(onlyItem(harness).status).toBe("approved");
    expect(lastState(harness).pendingCount).toBe(0);
  });

  it("EF-5: email nguồn không còn mở (currentMessageId khác) → KHÔNG chèn, GIỮ pending + cảnh báo", async () => {
    const insertSpy = vi.fn(async (): Promise<InsertOutcome> => ({ kind: "inserted" }));
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] }, insertImpl: insertSpy, currentId: "email-khac" });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    const outcome = await controller.approve(onlyItem(harness).id);
    expect(outcome).toEqual({ kind: "mismatch" });
    expect(insertSpy).not.toHaveBeenCalled(); // KHÔNG chèn tự động khi email nguồn sai
    expect(onlyItem(harness).status).toBe("pending"); // giữ pending — người dùng có thể Reject
    expect(lastState(harness).mismatchId).toBe("m1");
  });

  it("EF-2: chèn thất bại (write-failed / insertDraft throw) → item VỀ pending + ERR-09, KHÔNG nuốt", async () => {
    const failed = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] }, insertOutcome: { kind: "write-failed" } });
    const failedController = await booted(failed);
    failed.mutate();
    await settled(failed, failedController);
    const outcome1 = await failedController.approve(onlyItem(failed).id);
    expect(outcome1).toEqual({ kind: "insert-failed", code: "ERR-09" });
    expect(onlyItem(failed).status).toBe("pending"); // EF-2 — về pending
    expect(lastState(failed).lastError).toMatchObject({ code: "ERR-09" });

    const throwing = makeHarness({
      automation: { rules: [{ senderPattern: "boss@x.com" }] },
      insertImpl: vi.fn(async () => {
        throw new Error("boom");
      })
    });
    const throwingController = await booted(throwing);
    throwing.mutate();
    await settled(throwing, throwingController);
    const outcome2 = await throwingController.approve(onlyItem(throwing).id);
    expect(outcome2).toEqual({ kind: "insert-failed", code: "ERR-09" });
    expect(onlyItem(throwing).status).toBe("pending");
  });

  it("AF-5: Approve all một phần lỗi — item lỗi KHÔNG nuốt, tổng kết 2 thành công / 1 lỗi", async () => {
    const insertSpy = vi
      .fn(async (): Promise<InsertOutcome> => ({ kind: "inserted" }))
      .mockResolvedValueOnce({ kind: "inserted" })
      .mockResolvedValueOnce({ kind: "write-failed" })
      .mockResolvedValueOnce({ kind: "inserted" });
    const harness = makeHarness({ insertImpl: insertSpy, currentId: "m1" });
    const controller = await booted(harness);
    harness.queue.push(queueItem("q1", 1), queueItem("q2", 2), queueItem("q3", 3)); // 3 pending theo thứ tự
    const result = await controller.approveAll();
    expect(result).toEqual({ kind: "summary", summary: { approved: 2, failed: 1, failedIds: ["q2"] } });
    expect(insertSpy).toHaveBeenCalledTimes(3); // item lỗi KHÔNG chặn các item còn lại
    expect(harness.queue.find((item) => item.id === "q1")?.status).toBe("approved");
    expect(harness.queue.find((item) => item.id === "q2")?.status).toBe("pending"); // lỗi → về pending
    expect(harness.queue.find((item) => item.id === "q3")?.status).toBe("approved");
  });

  it("AF-5 actions: needs-confirm lần đầu → dừng + giữ pending; gọi lại VỚI decision → toàn bộ approved", async () => {
    const insertSpy = vi
      .fn(async (): Promise<InsertOutcome> => ({ kind: "inserted" }))
      .mockResolvedValueOnce({ kind: "needs-confirm", existing: "nội dung sẵn" })
      .mockResolvedValueOnce({ kind: "inserted" })
      .mockResolvedValueOnce({ kind: "inserted" });
    const harness = makeHarness({ insertImpl: insertSpy, currentId: "m1" });
    const controller = await booted(harness);
    harness.queue.push(queueItem("q1", 1), queueItem("q2", 2));
    const stopped = await controller.approveAll();
    expect(stopped).toEqual({ kind: "needs-confirm", existing: "nội dung sẵn" });
    expect(harness.queue.every((item) => item.status === "pending")).toBe(true);
    const summary = await controller.approveAll("append"); // panel hỏi xong → decision áp toàn bộ
    expect(summary).toEqual({ kind: "summary", summary: { approved: 2, failed: 0, failedIds: [] } });
    expect(harness.queue.every((item) => item.status === "approved")).toBe(true);
  });

  it("Reject → loại khỏi hàng chờ (AF-2); id lạ → not-found", async () => {
    const harness = makeHarness();
    const controller = await booted(harness);
    harness.queue.push(queueItem("q1", 1));
    expect(await controller.reject("q1")).toEqual({ kind: "rejected" });
    expect(harness.queue).toHaveLength(0); // loại KHỎI hàng chờ — không chèn
    expect(await controller.reject("q1")).toEqual({ kind: "not-found" });
  });
});
