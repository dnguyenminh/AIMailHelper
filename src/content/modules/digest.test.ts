// src/content/modules/digest.test.ts — TriageController UC-03 (FSD 6.6d; TC-117/TC-118): batch
// pipeline chia đúng batchSize (3+3+3+1 — US-08 AC3), progress {done,total,failed}, throttle giữa
// batch; BR-09 cache skip (0 LLM cho id đã cache, AF-1 badge/Digest vẫn cập nhật); cap 50 + EF-5
// overflow + AF-5 scanMore/AF-2 rescan; TD-8 reject per-item không gián đoạn (FR-GD5-06).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doneWith, item, makeHarness, newController, scoreOf } from "./digest-testkit";
import type { TriageScore } from "../../shared/types";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TriageController — batch pipeline (TC-118: chia 3+3+3+1, progress đúng)", () => {
  it("batchSize 3 + 10 item mới → đúng 4 request [3,3,3,1]; progress cộng dồn sau mỗi batch", async () => {
    const items = Array.from({ length: 10 }, (_, i) => item("m" + i));
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it, i) => scoreOf(it.messageId, 50 + i)))
    });
    const controller = newController(harness);
    await controller.start();
    expect(harness.requests.map((r) => r.items.length)).toEqual([3, 3, 3, 1]); // US-08 AC3
    const final = controller.getState();
    expect(final.status).toBe("done");
    expect(final.progress).toEqual({ done: 10, total: 10, failed: 0 });
    expect(final.digest).toHaveLength(10);
    expect(harness.saved).toHaveLength(4); // ghi GỘP — 1 lần/batch (§3.3)
  });

  it("throttle giữa các batch: sleep(throttleMs) GIỮA các batch, không chờ sau batch cuối (6.6d)", async () => {
    const items = Array.from({ length: 6 }, (_, i) => item("m" + i));
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOf(it.messageId, 10)))
    });
    const controller = newController(harness);
    await controller.start();
    expect(harness.sleeps).toEqual([1000]); // 2 batch → 1 lần throttle giữa
  });
});

describe("TriageController — BR-09 cache + cap 50 (TC-117)", () => {
  it("item đã cache → KHÔNG nằm trong request nào (BR-09 — 0 LLM); badge + Digest vẫn cập nhật (AF-1)", async () => {
    const items = [item("a"), item("b"), item("c")];
    const cached = new Map([["a", scoreOf("a", 90, "đã có từ lần trước")]]);
    const harness = makeHarness(items, cached, {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOf(it.messageId, 5)))
    });
    const controller = newController(harness);
    await controller.start();
    const requested = harness.requests.flatMap((r) => r.items.map((it) => it.messageId));
    expect(requested).toEqual(["b", "c"]); // chỉ item CHƯA cache
    expect(controller.getState().cachedSkipped).toBe(1);
    expect(harness.badges.some((b) => b.messageId === "a" && b.score === 90)).toBe(true);
    expect(controller.getState().digest[0]?.messageId).toBe("a"); // 90 cao nhất → đầu Digest (FR-GD5-04)
  });

  it("60 item (batchSize 50, cap 50) → quét đúng 50 + overflow 10 chờ 'Quét tiếp' (EF-5)", async () => {
    const items = Array.from({ length: 60 }, (_, i) => item("m" + i));
    const capConfig = { enabled: false, rules: [], batchSize: 50, throttleMs: 0, triageCap: 50 };
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOf(it.messageId, 1)))
    }, capConfig);
    const controller = newController(harness);
    await controller.start();
    expect(harness.requests.flatMap((r) => r.items.map((it) => it.messageId))).toHaveLength(50); // cap (#10)
    expect(controller.getState().overflow).toBe(10); // EF-5
  });

  it("AF-5 'Quét tiếp' (scanMore) → giữ kết quả cũ, chỉ gọi LLM cho item chưa cache", async () => {
    const items = [item("a"), item("b")];
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOf(it.messageId, 10)))
    });
    const controller = newController(harness);
    await controller.start();
    // Giả lập người dùng cuộn: item "c" mới xuất hiện trong list (AF-5)
    (harness.deps.collectItems as ReturnType<typeof vi.fn>).mockResolvedValue([item("a"), item("b"), item("c")]);
    (harness.deps.getCached as ReturnType<typeof vi.fn>).mockImplementation(async (ids: string[]) => {
      const found = new Map<string, TriageScore>();
      for (const id of ids) if (id !== "c") found.set(id, scoreOf(id, 10));
      return found;
    });
    await controller.scanMore();
    expect(harness.requests[harness.requests.length - 1]?.items.map((it) => it.messageId)).toEqual(["c"]);
    expect(controller.getState().digest).toHaveLength(3); // kết quả cũ GIỮ + item mới
  });

  it("AF-2 rescan (force) → bỏ cache, gọi LLM lại toàn bộ", async () => {
    const items = [item("a")];
    const cached = new Map([["a", scoreOf("a", 90)]]);
    const harness = makeHarness(items, cached, {
      respond: (batch, emit) => doneWith(batch, emit, batch.map((it) => scoreOf(it.messageId, 7)))
    });
    const controller = newController(harness);
    await controller.rescan();
    expect(harness.requests).toHaveLength(1); // item cached vẫn được gọi lại
    expect(controller.getState().cachedSkipped).toBe(0);
  });

  it("TD-8 ở mức controller: batch trả 2/3 score hợp lệ → done+=2, failed+=1, cache chỉ 2", async () => {
    const items = [item("a"), item("b"), item("c")];
    const scores = [scoreOf("a", 80), scoreOf("b", 60)];
    const harness = makeHarness(items, new Map(), {
      respond: (batch, emit) => doneWith(batch, emit, scores) // "c" bị reject (TD-8/id lạ)
    });
    const controller = newController(harness);
    await controller.start();
    const final = controller.getState();
    expect(final.progress).toEqual({ done: 2, total: 3, failed: 1 }); // FR-GD5-06 — không gián đoạn
    expect(final.digest).toHaveLength(2);
    expect(harness.saved[0]).toHaveLength(2);
  });

  it("Digest sort score giảm dần sau khi gộp batch + cache (FR-GD5-04)", async () => {
    const items = [item("low"), item("high"), item("mid")];
    const cached = new Map([["mid", scoreOf("mid", 55, "giữa")]]);
    const harness = makeHarness(items, cached, {
      respond: (batch, emit) => {
        const scores = batch.map((it) => scoreOf(it.messageId, it.messageId === "high" ? 90 : 10));
        doneWith(batch, emit, scores);
      }
    });
    const controller = newController(harness);
    await controller.start();
    expect(controller.getState().digest.map((e) => e.messageId)).toEqual(["high", "mid", "low"]);
    expect(controller.getState().digest[0]?.reason).toBe("lý do"); // reason hiển thị Digest
  });
});
