// src/content/modules/reply.test.ts — ReplyController UC-02 (FR-GD4-01..03, 07):
// stream → preview (rAF-gom) → ready; EF-3/EF-4 giữ phần đã nhận + retry; AF-3 start mới hủy cũ;
// EF-5 so khớp messageId → mismatch KHÔNG chèn; ERR-09 giữ draft để copy tay (FR-GD4-07); BR-10.
import { describe, expect, it, vi } from "vitest";
import { ReplyController } from "./reply";
import type { ReplyDeps, ReplyOptions, ReplyUiState } from "./reply";
import type { InsertOutcome } from "../owa-adapter/actions";
import type { PortEvent } from "../../shared/messaging";
import type { EmailData } from "../../shared/types";

const EMAIL: EmailData = {
  messageId: "m1",
  subject: "Báo giá",
  sender: { name: "An", email: "an@x.vn" },
  to: [],
  cc: [],
  bodyText: "Nội dung",
  detectedView: "reading-pane"
};
const OPTIONS: ReplyOptions = { tone: "chinh-thuc", language: "auto", extraInstructions: "" };

interface Harness {
  deps: ReplyDeps;
  states: ReplyUiState[];
  events: ((event: PortEvent) => void)[];
  cancelCount(): number;
  insertSpy: ReturnType<typeof vi.fn>;
  currentIdSpy: ReturnType<typeof vi.fn>;
}

function makeHarness(outcome: InsertOutcome | null = null, currentId: string | null = "m1"): Harness {
  const states: ReplyUiState[] = [];
  const events: ((event: PortEvent) => void)[] = [];
  let cancels = 0;
  const insertSpy = vi.fn(async () => outcome ?? ({ kind: "inserted" } as InsertOutcome));
  const currentIdSpy = vi.fn(async () => currentId);
  const deps: ReplyDeps = {
    request: (_kind, _payload, onEvent) => {
      events.push(onEvent);
      return { cancel: () => { cancels += 1; } };
    },
    insertDraft: insertSpy,
    currentMessageId: currentIdSpy,
    onState: (state) => states.push(state)
  };
  return { deps: deps, states: states, events: events, cancelCount: () => cancels, insertSpy: insertSpy, currentIdSpy: currentIdSpy };
}

async function started(harness: Harness): Promise<ReplyController> {
  const controller = new ReplyController(harness.deps);
  controller.start(EMAIL, OPTIONS);
  await vi.waitFor(() => expect(harness.events.length).toBeGreaterThan(0));
  return controller;
}

function lastEvent(harness: Harness): (event: PortEvent) => void {
  return harness.events[harness.events.length - 1] as (event: PortEvent) => void;
}

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
