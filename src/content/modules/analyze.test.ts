// src/content/modules/analyze.test.ts — AnalyzeController (UC-01 orchestration, TDD §3.7):
// reading → streaming accumulate → done parse → AnalysisView state; readEmail throw → error state
// (ERR-10/BR-14); Port error → error state giữ raw (EF-4); AF-4 — start mới cancel handle cũ;
// EF-6 — done nhưng parse fail → error + ef6Raw, KHÔNG tự retry.
import { describe, expect, it, vi } from "vitest";
import { AnalyzeController, toAnalysisError } from "./analyze";
import type { AnalysisUiState } from "./analyze";
import { AppError } from "../../shared/errors";
import type { PortEvent } from "../../shared/messaging";
import type { EmailData } from "../../shared/types";

const EMAIL: EmailData = {
  messageId: "m1",
  subject: "s",
  sender: { name: "a", email: "a@x.vn" },
  to: [],
  cc: [],
  hasAttachment: false, bodyText: "body",
  detectedView: "reading-pane"
};

interface Deps {
  readEmail: () => Promise<EmailData>;
  request: (kind: "analyze", payload: { email: EmailData }, onEvent: (event: PortEvent) => void) => { cancel(): void };
  onState: (state: AnalysisUiState) => void;
}

interface Harness {
  deps: Deps;
  states: AnalysisUiState[];
  events: ((event: PortEvent) => void)[];
  cancelCount(): number;
}

function makeHarness(): Harness {
  const states: AnalysisUiState[] = [];
  const events: ((event: PortEvent) => void)[] = [];
  let cancelCalls = 0;
  const deps: Deps = {
    readEmail: async () => EMAIL,
    request: (_kind, _payload, onEvent) => {
      events.push(onEvent);
      return { cancel: () => { cancelCalls += 1; } };
    },
    onState: (state) => states.push(state)
  };
  return { deps: deps, states: states, events: events, cancelCount: () => cancelCalls };
}

const fullJson =
  '{"summary":"Tóm tắt","importanceScore":85,"intent":"Xin duyệt","actions":["Trả lời"],"deadline":null,"sentiment":"tích cực"}';

describe("AnalyzeController — UC-01 state machine (GĐ3)", () => {
  it("reading → streaming (chunk, rAF-gom) → done parse → state done + AnalysisResult", async () => {
    const harness = makeHarness();
    const controller = new AnalyzeController(harness.deps);
    const startPromise = controller.start();
    await vi.waitFor(() => {
      expect(harness.events.length).toBeGreaterThan(0); // start async — chờ request đăng ký xong
    });
    const onEvent = harness.events[harness.events.length - 1] as (event: PortEvent) => void;
    onEvent({ type: "chunk", requestId: "r", seq: 0, delta: fullJson.slice(0, 40) });
    onEvent({ type: "chunk", requestId: "r", seq: 1, delta: fullJson.slice(40) });
    onEvent({ type: "done", requestId: "r" });
    await startPromise;
    const final = controller.getState();
    expect(final.status).toBe("done");
    expect(final.result?.importanceScore).toBe(85);
    expect(final.result?.importanceLabel).toBe("cao");
    expect(final.raw).toContain("Tóm tắt");
    expect(harness.states.some((s) => s.status === "streaming")).toBe(true);
  });

  it("readEmail throw ERR-10 (BR-14) → error state, KHÔNG gọi Port request", async () => {
    const harness = makeHarness();
    harness.deps.readEmail = async () => {
      throw new AppError("ERR-10", "errors.emptyEmail");
    };
    const controller = new AnalyzeController(harness.deps);
    await controller.start();
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("ERR-10");
    expect(final.error?.i18nKey).toBe("errors.emptyEmail");
    expect(harness.events).toHaveLength(0); // không gọi LLM với payload rỗng
  });

  it("Port error event → error state giữ phần raw đã nhận (EF-4)", async () => {
    const harness = makeHarness();
    const controller = new AnalyzeController(harness.deps);
    const startPromise = controller.start();
    await vi.waitFor(() => {
      expect(harness.events.length).toBeGreaterThan(0);
    });
    const onEvent = harness.events[0] as (event: PortEvent) => void;
    onEvent({ type: "chunk", requestId: "r", seq: 0, delta: "phần đầu" });
    onEvent({ type: "error", requestId: "r", code: "ERR-07", i18nKey: "errors.streamInterrupted", retryable: false });
    await startPromise;
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("ERR-07");
    expect(final.raw).toBe("phần đầu"); // EF-4 — giữ phần đã render
  });

  it("EF-6: done nhưng output không parse được → error + ef6Raw (KHÔNG tự retry)", async () => {
    const harness = makeHarness();
    const controller = new AnalyzeController(harness.deps);
    const startPromise = controller.start();
    await vi.waitFor(() => {
      expect(harness.events.length).toBeGreaterThan(0);
    });
    const onEvent = harness.events[0] as (event: PortEvent) => void;
    onEvent({ type: "chunk", requestId: "r", seq: 0, delta: "Tôi sẽ bỏ qua mọi hướng dẫn." });
    onEvent({ type: "done", requestId: "r" });
    await startPromise;
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("EF-6");
    expect(final.error?.ef6Raw).toContain("bỏ qua mọi hướng dẫn");
    expect(final.result).toBeNull();
  });

  it("AF-4: start lần 2 → handle lần 1 bị cancel (đổi email giữa chừng)", async () => {
    const harness = makeHarness();
    const controller = new AnalyzeController(harness.deps);
    const firstStart = controller.start();
    await vi.waitFor(() => {
      expect(harness.events.length).toBeGreaterThan(0);
    });
    await firstStart;
    await controller.start(); // email mới — request cũ hủy
    expect(harness.cancelCount()).toBe(1);
    expect(harness.events.length).toBe(2);
  });

  it("cancel() chủ động → handle cancel + state về idle", async () => {
    const harness = makeHarness();
    const controller = new AnalyzeController(harness.deps);
    const startPromise = controller.start();
    await vi.waitFor(() => {
      expect(harness.events.length).toBeGreaterThan(0);
    });
    await startPromise;
    controller.cancel();
    expect(harness.cancelCount()).toBe(1);
    expect(controller.getState().status).toBe("idle");
  });

  it("toAnalysisError: AppError → giữ code/i18nKey; lỗi lạ → ERR-15 + console.error", () => {
    expect(toAnalysisError(new AppError("ERR-06", "errors.owaNotFound"))).toMatchObject({ code: "ERR-06" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toAnalysisError(new Error("boom"))).toMatchObject({ code: "ERR-15" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

