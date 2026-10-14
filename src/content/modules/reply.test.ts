// src/content/modules/reply.test.ts — ReplyController UC-02 stream → preview (FR-GD4-01..02):
// chunk gom rAF → done → ready; EF-3/EF-4 giữ phần đã nhận + retry; AF-3 start mới hủy cũ;
// cancel chủ động. (EF-5/BR-10/ERR-09 khi chèn nằm ở reply-insert.test.ts — file ≤ 200 dòng §1.4 #7.)
import { describe, expect, it, vi } from "vitest";
import { EMAIL, lastEvent, makeHarness, OPTIONS, started } from "./reply-testkit";

describe("ReplyController — UC-02 stream → preview (FR-GD4-02)", () => {
  it("chunk gom rAF → done → status ready + draft đầy đủ", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "Kính gửi " });
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 1, delta: "anh Minh," });
    lastEvent(harness)({ type: "done", requestId: "r" });
    const final = controller.getState();
    expect(final.status).toBe("ready");
    expect(final.draft).toBe("Kính gửi anh Minh,");
    expect(harness.states.some((s) => s.status === "streaming")).toBe(true);
  });

  it("EF-3/EF-4: stream đứt giữa chừng → error state, GIỮ phần draft đã nhận", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "một phần" });
    lastEvent(harness)({ type: "error", requestId: "r", code: "ERR-07", i18nKey: "errors.streamInterrupted", retryable: false });
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("ERR-07");
    expect(final.draft).toBe("một phần"); // giữ phần đã nhận trong preview
  });

  it("EF-3: retry → sinh lại TỪ ĐẦU với cùng email + options (request lần 2, hủy handle cũ)", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    lastEvent(harness)({ type: "chunk", requestId: "r", seq: 0, delta: "một phần" });
    lastEvent(harness)({ type: "error", requestId: "r", code: "ERR-07", i18nKey: "errors.streamInterrupted", retryable: false });
    controller.retry();
    await vi.waitFor(() => expect(harness.events.length).toBe(2));
    expect(harness.cancelCount()).toBe(1);
    expect(controller.getState().status).toBe("streaming");
    expect(controller.getState().draft).toBe("");
  });

  it("AF-3: start lần 2 (đổi tone) → handle cũ bị hủy, state reset", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    controller.start(EMAIL, { ...OPTIONS, tone: "ngan-gon" });
    expect(harness.cancelCount()).toBe(1);
    expect(controller.getState().status).toBe("streaming");
  });

  it("cancel() chủ động → handle hủy + state về idle", async () => {
    const harness = makeHarness();
    const controller = await started(harness);
    controller.cancel();
    expect(harness.cancelCount()).toBe(1);
    expect(controller.getState().status).toBe("idle");
  });
});
