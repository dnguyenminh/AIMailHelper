// src/content/modules/automode.test.ts — GĐ6 auto-mode pipeline (TC-119/TC-120; FR-GD6-02..06).
// Observer chỉ khi enabled (BR-02) · BR-13 rules rỗng → chỉ analyze · rule match → draft → queue ·
// tắt → observer HỦY + queue GIỮ NGUYÊN + 0 fetch (FR-GD6-06) · QUEUE_MAX (§7.4) · EF-6/EF-1.
// Approve/reject UC-07 tách ở automode-approve.test.ts. KHÔNG đường tự Send (BR-01).
import { describe, expect, it, vi } from "vitest";
import { analysisOf, booted, defaultScript, DRAFT_TEXT, kindsOf, lastState, makeHarness, onlyItem, settled } from "./automode-testkit";
import type { PortEvent } from "../../shared/messaging";

const kinds = kindsOf;

describe("AutoModeController — observer lifecycle (TC-119 #5, BR-02)", () => {
  it("enabled=false → observer KHÔNG đăng ký, KHÔNG fetch (mặc định TẮT)", async () => {
    const harness = makeHarness({ automation: { enabled: false } });
    await booted(harness);
    expect(harness.observer.registered).toHaveLength(0);
    expect(kinds(harness)).toEqual([]); // 0 fetch tự động
  });

  it("enabled=true → observer đăng ký đúng 1 lần trên inbox-list target", async () => {
    const harness = makeHarness();
    await booted(harness);
    expect(harness.observer.registered).toEqual([harness.target]);
    expect(lastState(harness).enabled).toBe(true);
  });

  it("observeTarget null (không thấy inbox) → ERR-06, không đăng ký", async () => {
    const harness = makeHarness();
    harness.deps.observeTarget = vi.fn(async () => null);
    await booted(harness);
    expect(harness.observer.registered).toHaveLength(0);
    expect(lastState(harness).lastError).toMatchObject({ code: "ERR-06" });
  });
});

describe("AutoModeController — rule pipeline (TC-119 #1-4, BR-13)", () => {
  it("TC-119 #1: rules rỗng → CHỈ analyze (spy draft request = 0), không item nào vào queue (BR-13)", async () => {
    const harness = makeHarness(); // AUTOMATION_ENABLED.rules = []
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze"]); // analyze x1 — draft x0
    expect(harness.queue).toHaveLength(0);
  });

  it("TC-119 #2: senderPattern khớp → draft vào hàng chờ pending (luồng analyze→rule→reply→queue)", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] } });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze", "reply"]);
    expect(harness.queue).toHaveLength(1);
    expect(onlyItem(harness)).toMatchObject({ messageId: "m1", draft: DRAFT_TEXT, status: "pending" });
    expect(lastState(harness).pendingCount).toBe(1);
  });

  it("TC-119 #2: senderPattern KHÔNG khớp → 0 draft request, queue rỗng", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "other@x.com" }] } });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze"]);
    expect(harness.queue).toHaveLength(0);
  });

  it("TC-119 #3: subjectPattern case-insensitive — 'invoice' khớp 'INVOICE #123' → draft", async () => {
    const harness = makeHarness({ automation: { rules: [{ subjectPattern: "invoice" }] } });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze", "reply"]);
    expect(harness.queue).toHaveLength(1);
  });

  it("TC-119 #4: minImportance=70 — score 69 KHÔNG draft; score 70 draft vào queue (biên)", async () => {
    const below = makeHarness({ automation: { rules: [{ minImportance: 70 }] }, analysis: analysisOf(69) });
    const belowController = await booted(below);
    below.mutate();
    await settled(below, belowController);
    expect(kinds(below)).toEqual(["analyze"]);
    expect(below.queue).toHaveLength(0);

    const at = makeHarness({ automation: { rules: [{ minImportance: 70 }] }, analysis: analysisOf(70) });
    const atController = await booted(at);
    at.mutate();
    await settled(at, atController);
    expect(kinds(at)).toEqual(["analyze", "reply"]);
    expect(at.queue).toHaveLength(1);
  });

  it("analyze parse fail (EF-6) → KHÔNG draft, lastError EF-6; mutate lại được thử lại", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] } });
    harness.script = (kind, emit) => {
      if (kind === "analyze") emit({ type: "chunk", requestId: "r", seq: 0, delta: "không phải JSON" });
      emit({ type: "done", requestId: "r" }); // chunk + done — stream kết thúc mới parse được
    };
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze"]);
    expect(harness.queue).toHaveLength(0);
    expect(lastState(harness).lastError).toMatchObject({ code: "EF-6" });
  });

  it("analyze stream lỗi (EF-1) → lastError + không item; mutate sau khi script ổn → retry thành công", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] } });
    harness.script = (_kind, emit) => emit({ type: "error", requestId: "r", code: "ERR-03", i18nKey: "errors.rateLimited", retryable: true } as PortEvent);
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(harness.queue).toHaveLength(0);
    expect(lastState(harness).lastError).toMatchObject({ code: "ERR-03" });
    harness.script = defaultScript(analysisOf(80)); // provider hồi phục
    harness.mutate();
    await settled(harness, controller);
    expect(harness.queue).toHaveLength(1); // EF-1 — thử lại theo mutation kế tiếp
  });
});

describe("AutoModeController — tắt auto-mode (TC-120 #4, FR-GD6-06)", () => {
  it("tắt khi còn hàng chờ → observer HỦY, queue GIỮ NGUYÊN, 0 fetch tự động sau khi tắt", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] } });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(harness.queue).toHaveLength(1); // có hàng chờ trước khi tắt

    harness.automation.enabled = false;
    await controller.sync();
    expect(harness.observer.disconnects).toBe(1); // hủy đăng ký hoàn toàn
    expect(lastState(harness).enabled).toBe(false);

    const callsBefore = harness.requestSpy.mock.calls.length;
    harness.mutate(); // mutation sau khi tắt → phải bị bỏ qua
    expect(harness.requestSpy.mock.calls.length).toBe(callsBefore); // 0 fetch tự động
    expect(harness.queue).toHaveLength(1); // FR-GD6-06 — hàng chờ giữ nguyên
    expect(onlyItem(harness).status).toBe("pending"); // không tự hành động gì
  });

  it("QUEUE_MAX đầy (addToQueue null) → queueFull cảnh báo, item KHÔNG thêm", async () => {
    const harness = makeHarness({ automation: { rules: [{ senderPattern: "boss@x.com" }] }, full: true });
    const controller = await booted(harness);
    harness.mutate();
    await settled(harness, controller);
    expect(kinds(harness)).toEqual(["analyze", "reply"]); // draft đã sinh...
    expect(harness.queue).toHaveLength(0); // ...nhưng KHÔNG vào queue (§7.4)
    expect(lastState(harness).queueFull).toBe(true);
  });
});