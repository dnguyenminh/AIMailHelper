// src/content/modules/analyze-cancel.test.ts — uat58: chống chồng instance (start mới hủy
// run cũ — orphan không đè state) + watchdog chống treo "Đang phân tích…" (stream câm → ERR-07).
import { describe, expect, it, vi } from "vitest";
import { AnalyzeController } from "./analyze";
import type { AnalysisUiState } from "./analyze";
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
  readEmail: (signal?: { cancelled: boolean }) => Promise<EmailData>;
  request: (kind: "analyze", payload: { email: EmailData }, onEvent: (event: PortEvent) => void) => { cancel(): void };
  onState: (state: AnalysisUiState) => void;
}

function makeHarness(): { deps: Deps; states: AnalysisUiState[]; events: ((event: PortEvent) => void)[] } {
  const states: AnalysisUiState[] = [];
  const events: ((event: PortEvent) => void)[] = [];
  const deps: Deps = {
    readEmail: async () => EMAIL,
    request: (_kind, _payload, onEvent) => {
      events.push(onEvent);
      return { cancel: () => undefined };
    },
    onState: (state) => states.push(state)
  };
  return { deps: deps, states: states, events: events };
}

const fullJson =
  '{"summary":"Tóm tắt","importanceScore":85,"intent":"Xin duyệt","actions":["Trả lời"],"deadline":null,"sentiment":"tích cực"}';

describe("AnalyzeController — chống chồng instance + watchdog (uat58)", () => {
  it("start lần 2 → signal run 1 cancelled + run 1 không đè state", async () => {
    const harness = makeHarness();
    const signals: Array<{ cancelled: boolean }> = [];
    const holder: { release: ((email: EmailData) => void) | null } = { release: null };
    harness.deps.readEmail = async (signal) => {
      if (signal !== undefined) signals.push(signal);
      if (signals.length === 1) {
        await new Promise<EmailData>((resolve) => { holder.release = resolve; });
      }
      return EMAIL;
    };
    const controller = new AnalyzeController(harness.deps);
    const run1 = controller.start(); // run 1 — treo trong readEmail
    await vi.waitFor(() => expect(signals.length).toBe(1));
    await controller.start(); // run 2 — flip signal run 1, chạy xong (state streaming)
    expect(signals[0]?.cancelled).toBe(true);
    expect(controller.getState().status).toBe("streaming");
    const statesAfterRun2 = harness.states.length;
    holder.release?.(EMAIL); // run 1 xong MUỘN — không được đụng state của run 2
    await run1;
    expect(harness.states.length).toBe(statesAfterRun2); // 0 state mới từ run 1
    expect(controller.getState().status).toBe("streaming"); // run 2 vẫn owns state
  });

  it("cancel() flip signal — pipeline Copilot nhận flag để tự chết", async () => {
    const harness = makeHarness();
    const seen: Array<boolean | undefined> = [];
    harness.deps.readEmail = async (signal) => {
      seen.push(signal?.cancelled);
      return EMAIL;
    };
    const controller = new AnalyzeController(harness.deps);
    await controller.start();
    controller.cancel();
    expect(seen[0]).toBe(false); // run nhận signal sống
  });

  it("stream câm 120s → watchdog ERR-07 (không treo Đang phân tích…)", async () => {
    vi.useFakeTimers();
    try {
      const harness = makeHarness();
      const controller = new AnalyzeController(harness.deps);
      const run = controller.start(); // readEmail trả ngay → streaming + request đăng ký
      await vi.advanceTimersByTimeAsync(1);
      expect(controller.getState().status).toBe("streaming");
      await vi.advanceTimersByTimeAsync(120_000); // không CÓ event nào cả
      await run;
      const final = controller.getState();
      expect(final.status).toBe("error");
      expect(final.error?.code).toBe("ERR-07");
      expect(final.error?.i18nKey).toBe("errors.timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("watchdog HỦY khi có chunk — không bắn nhầm stream sống", async () => {
    vi.useFakeTimers();
    try {
      const harness = makeHarness();
      const controller = new AnalyzeController(harness.deps);
      const run = controller.start();
      await vi.advanceTimersByTimeAsync(1);
      const onEvent = harness.events[harness.events.length - 1] as (event: PortEvent) => void;
      onEvent({ type: "chunk", requestId: "r", seq: 0, delta: fullJson.slice(0, 40) });
      await vi.advanceTimersByTimeAsync(120_000); // quá hạn watchdog nhưng stream ĐÃ sống
      onEvent({ type: "chunk", requestId: "r", seq: 1, delta: fullJson.slice(40) });
      onEvent({ type: "done", requestId: "r" });
      await run;
      const final = controller.getState();
      expect(final.status).toBe("done"); // KHÔNG bị ERR-07 nhét vào giữa
      expect(final.result?.importanceScore).toBe(85);
    } finally {
      vi.useRealTimers();
    }
  });
});
