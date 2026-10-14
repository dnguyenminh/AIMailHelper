// src/content/modules/digest-retry.test.ts — TriageController retry/backoff + dừng an toàn
// (FSD 6.6d; TC-118; EF-2/EF-3/EF-4): 429 retryable → MAX_RETRY_BATCH 3 với backoff
// throttleMs→×2 (cap 10s), hết lượt → item "chưa chấm", batch sau vẫn chạy; ERR-15 non-retryable
// → fail ngay không backoff; folder đổi giữa chừng → dừng giữ kết quả; user cancel; ERR-06.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RETRY_BATCH } from "./digest-batch";
import { doneWith, errorEvent, item, makeHarness, newController } from "./digest-testkit";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TriageController — backoff + MAX_RETRY_BATCH (TC-118, 6.6d)", () => {
  it("429 retryable: thử đúng MAX_RETRY_BATCH lần với backoff 1000→2000 rồi hết lượt (EF-3)", async () => {
    const items = [item("a"), item("b")];
    const harness = makeHarness(items, new Map(), {
      respond: (_batch, emit) => emit(errorEvent("ERR-03", true)) // batch 1 luôn 429
    });
    const controller = newController(harness);
    await controller.start();
    expect(harness.requests).toHaveLength(MAX_RETRY_BATCH); // thử 3 lần
    expect(harness.sleeps.slice(0, 2)).toEqual([1000, 2000]); // throttleMs → ×2 (cap 10s)
    const final = controller.getState();
    expect(final.progress.failed).toBe(2); // item "chưa chấm" (EF-3)
    expect(final.error?.code).toBe("ERR-03");
  });

  it("hết lượt batch 1 → batch SAU vẫn chạy (không gián đoạn — EF-3)", async () => {
    const items = [item("a"), item("b"), item("c"), item("d")];
    const config = { enabled: false, rules: [], batchSize: 2, throttleMs: 1000, triageCap: 50 };
    let call = 0;
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => {
        call += 1;
        if (call <= MAX_RETRY_BATCH) emit(errorEvent("ERR-03", true)); // batch 1 luôn lỗi
        else doneWith(batch, emit, batch.map((it) => scoreOfSafe(it))); // batch 2 OK
      }
    }, config);
    const controller = newController(harness);
    await controller.start();
    expect(harness.requests).toHaveLength(MAX_RETRY_BATCH + 1);
    const final = controller.getState();
    expect(final.progress).toEqual({ done: 2, total: 4, failed: 2 });
    expect(final.digest.map((e) => e.messageId)).toEqual(["c", "d"]);
  });

  it("ERR-15 non-retryable → KHÔNG sleep backoff, batch fail ngay, batch sau vẫn chạy", async () => {
    const items = [item("a"), item("b"), item("c"), item("d")];
    const config = { enabled: false, rules: [], batchSize: 2, throttleMs: 1000, triageCap: 50 };
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => {
        if (batch[0]?.messageId === "a") emit(errorEvent("ERR-15", false));
        else doneWith(batch, emit, batch.map((it) => scoreOfSafe(it)));
      }
    }, config);
    const controller = newController(harness);
    await controller.start();
    expect(harness.requests).toHaveLength(2); // mỗi batch đúng 1 lần — không retry
    expect(harness.sleeps).toEqual([1000]); // chỉ throttle giữa batch — KHÔNG backoff
    expect(controller.getState().progress).toEqual({ done: 2, total: 4, failed: 2 });
  });

  it("cap backoff 10s: throttleMs lớn → sleep bị chặn tại MAX_BACKOFF_MS", async () => {    const items = [item("a")];
    const config = { enabled: false, rules: [], batchSize: 1, throttleMs: 8000, triageCap: 50 };
    const harness = makeHarness(items, new Map(), {
      respond: (_batch, emit) => emit(errorEvent("ERR-16", true)) // luôn 5xx
    }, config);
    const controller = newController(harness);
    await controller.start();
    expect(harness.sleeps.slice(0, 3)).toEqual([8000, 10000]); // 3 attempt → 2 sleep giữa: 8000 → cap 10s (6.6d)
  });
});

describe("TriageController — EF-2/EF-4 folder đổi + user cancel + ERR-06", () => {
  it("folder đổi trước batch 2 → dừng giữ kết quả batch 1, folderStopped=true", async () => {
    const items = Array.from({ length: 6 }, (_, i) => item("m" + i));
    let folderChecks = 0;
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOfSafe(it)))
    });
    (harness.deps.hasFolderChanged as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      folderChecks += 1;
      return folderChecks >= 2; // check #1 (trước batch 1) false; #2 true
    });
    const controller = newController(harness);
    await controller.start();
    const final = controller.getState();
    expect(final.folderStopped).toBe(true); // EF-2/EF-4
    expect(final.progress.done).toBe(3); // chỉ batch 1 hoàn tất
    expect(final.digest).toHaveLength(3);
    expect(harness.requests).toHaveLength(1);
  });

  it("collectItems ERR-06 → status error với i18nKey (BR-08), KHÔNG gọi batch nào", async () => {
    const harness = makeHarness([]);
    (harness.deps.collectItems as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("errors.owaNotFound"), { code: "ERR-06", i18nKey: "errors.owaNotFound" })
    );
    const controller = newController(harness);
    await controller.start();
    const final = controller.getState();
    expect(final.status).toBe("error");
    expect(final.error?.code).toBe("ERR-06");
    expect(harness.requests).toHaveLength(0);
  });

  it("user cancel giữa batch → run.cancel được gọi; loop dừng, không cache gì thêm (EF-3)", async () => {
    const items = Array.from({ length: 6 }, (_, i) => item("m" + i));
    const harness = makeHarness(items, new Map(), {
      respond: (_batch, _emit) => undefined // giữ batch treo — người dùng bấm Dừng
    });
    harness.deps.request = (batch, onEvent) => {
      harness.requests.push({ items: batch as typeof items, emit: onEvent });
      return { cancel: () => undefined };
    };
    const controller = newController(harness);
    const running = controller.start();
    await vi.waitFor(() => expect(harness.requests.length).toBe(1));
    controller.cancel(); // EF-3 — dừng chủ động
    await running;
    const final = controller.getState();
    expect(final.status).toBe("done");
    expect(final.digest).toHaveLength(0); // chưa có kết quả nào hoàn tất
    expect(harness.saved).toHaveLength(0);
  });
});

const scoreOfSafe = (it: { messageId: string }): { messageId: string; score: number; reason: string; analyzedAt: string } =>
  ({ messageId: it.messageId, score: 9, reason: "lý do", analyzedAt: new Date().toISOString() });
