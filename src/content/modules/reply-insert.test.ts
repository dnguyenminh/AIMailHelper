// src/content/modules/reply-insert.test.ts — ReplyController chèn draft (FSD 6.3; FR-GD4-03/07):
// BR-10 draft rỗng vô hiệu chèn; EF-5 so khớp messageId → mismatch KHÔNG chèn tự động;
// TD-11 (TA review GĐ4): re-check EF-5 CẢ trên lần chèn CÓ decision; insertAnyway "vẫn chèn";
// ERR-09 (write-failed/compose-not-found) → giữ draft để copy tay (EF-1 UC-02).
import { describe, expect, it } from "vitest";
import { lastEvent, makeHarness, started } from "./reply-testkit";
import type { InsertOutcome } from "../owa-adapter/actions";

describe("ReplyController — EF-5 / BR-10 / ERR-09 khi chèn (FSD 6.3)", () => {
  it("BR-10 lớp 2: draft rỗng → blocked-empty, không gọi insertDraft/currentMessageId", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    const outcome = await controller.insert();
    expect(outcome).toEqual({ kind: "blocked-empty" });
    expect(harness.insertSpy).not.toHaveBeenCalled();
  });

  it("EF-5: email đang mở KHÁC messageId nguồn → mismatch + KHÔNG chèn tự động", async () => {
    const harness = makeHarness(undefined, "email-B");
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    const outcome = await controller.insert();
    expect(outcome).toEqual({ kind: "mismatch" });
    expect(harness.insertSpy).not.toHaveBeenCalled(); // KHÔNG chèn tự động
    expect(controller.getState().mismatch).toBe(true);
  });

  it("EF-5: không đọc được email hiện tại (null) → coi như không xác minh → mismatch", async () => {
    const harness = makeHarness(undefined, null);
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    expect(await controller.insert()).toEqual({ kind: "mismatch" });
  });

  it("messageId khớp → insertDraft với draft + outcome pass-through", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    await controller.insert();
    expect(harness.insertSpy).toHaveBeenCalledWith("draft", undefined);
    expect(controller.getState().mismatch).toBe(false);
  });

  it("EF-5 'vẫn chèn' → insertAnyway bỏ qua so khớp (currentMessageId không được gọi)", async () => {
    const harness = makeHarness(undefined, "email-B");
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    await controller.insert();
    await controller.insertAnyway("replace");
    expect(harness.currentIdSpy).toHaveBeenCalledTimes(1); // lần đầu thôi — insertAnyway skip
    expect(harness.insertSpy).toHaveBeenCalledWith("draft", "replace");
    expect(controller.getState().mismatch).toBe(false);
  });

  // TD-11 (TA review GĐ4 — làm cùng batch GĐ5): EF-5 re-check CẢ trên lần chèn CÓ decision —
  // email có thể đổi giữa 2 lần confirm; bỏ điều kiện `decision === undefined` trong guard.
  it("TD-11: insert CÓ decision (replace) vẫn re-check EF-5 → mismatch KHÔNG chèn", async () => {
    const harness = makeHarness(undefined, "email-B"); // email đang mở khác nguồn
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    const outcome = await controller.insert(undefined, "replace");
    expect(outcome).toEqual({ kind: "mismatch" });
    expect(harness.insertSpy).not.toHaveBeenCalled(); // KHÔNG ghi đè email khác
    expect(controller.getState().mismatch).toBe(true);
  });

  it("dismissMismatch → cảnh báo tắt, không đổi status", async () => {
    const harness = makeHarness(undefined, "email-B");
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    await controller.insert();
    controller.dismissMismatch();
    expect(controller.getState().mismatch).toBe(false);
    expect(controller.getState().status).toBe("ready");
  });

  it("ERR-09: write-failed → error state (errors.insertFailed) + draft GIỮ để copy tay (FR-GD4-07)", async () => {
    const outcome: InsertOutcome = { kind: "write-failed" };
    const harness = makeHarness(outcome);
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    const result = await controller.insert();
    expect(result).toEqual({ kind: "write-failed" });
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("ERR-09");
    expect(final.error?.i18nKey).toBe("errors.insertFailed");
    expect(final.draft).toBe("draft"); // giữ preview — người dùng copy tay
  });

  it("ERR-09: compose-not-found (EF-2) → cùng error state giữ draft", async () => {
    const outcome: InsertOutcome = { kind: "compose-not-found" };
    const harness = makeHarness(outcome);
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "draft" });
    lastEvent(harness)({ type: "done", requestId: "r" });
    await controller.insert();
    expect(controller.getState().error?.code).toBe("ERR-09");
    expect(controller.getState().draft).toBe("draft");
  });
});
