// src/content/owa-adapter/diagnose.test.ts — GĐ4 UC-09 (FR-GD4-06): báo cáo redact (M-2 — label
// CHỈ giữ cho control chức năng; subject/sender/body KHÔNG lọt), EF-3 cảnh báo privacy, EF-1
// truncation, đối chiếu nút gửi (chỉ hiện diện — extension không có đường kích hoạt — BR-01).
import { describe, expect, it } from "vitest";
import { MAX_REPORT_CHARS, collectDiagnoseReport, probeAllChains } from "./diagnose";
import type { DiagnoseDeps } from "./diagnose";

const SUBJECT = "Họp duyệt ngân sách Q4-XYZ";
const SENDER = "nguyen.van.a@congty.vn";

function snapshotWith(...lines: string[]): string {
  return lines.join("\n");
}

function makeDeps(overrides: Partial<DiagnoseDeps> & { snapshotText?: string } = {}): DiagnoseDeps {
  const snapshotText = overrides.snapshotText;
  const base: DiagnoseDeps = {
    detect: () => ({ view: "reading-pane", container: document.body }),
    snapshot: () => snapshotText ?? "",
    layoutHash: async () => "abc123def456",
    probeChains: () => [],
    sendPresence: () => false,
    userAgent: () => "test-agent"
  };
  return { ...base, ...overrides, snapshot: () => snapshotText ?? "" }; // snapshot string luôn thắng spread
}

describe("UC-09 — collectDiagnoseReport", () => {
  it("M-2: subject/sender trong label phi chức năng → [redacted-label], KHÔNG xuất hiện trong report", async () => {
    const snapshot = snapshotWith(
      'listitem "' + SUBJECT + '" (ref_1)',
      'listitem "' + SENDER + ' gửi lúc 10:00" (ref_2)'
    );
    const report = await collectDiagnoseReport(makeDeps({ snapshotText: snapshot }));
    expect(report.text).not.toContain("Q4-XYZ");
    expect(report.text).not.toContain(SENDER);
    expect(report.text).toContain("[redacted-label]");
  });

  it("label control chức năng giữ nguyên (Trả lời / Forward / Soạn)", async () => {
    const snapshot = snapshotWith('button "Trả lời" (ref_1)', 'button "Forward" (ref_2)', 'button "Soạn thư mới" (ref_3)');
    const report = await collectDiagnoseReport(makeDeps({ snapshotText: snapshot }));
    expect(report.text).toContain('button "Trả lời"');
    expect(report.text).toContain('button "Forward"');
    expect(report.text).toContain('button "Soạn thư mới"');
    expect(report.text).not.toContain("[redacted-label]");
  });

  it("EF-3: cảnh báo privacy + layout hash + view trong report", async () => {
    const report = await collectDiagnoseReport(makeDeps({}));
    expect(report.text).toContain("[EF-3]");
    expect(report.text).toContain("rà soát trước khi gửi");
    expect(report.text).toContain("abc123def456");
    expect(report.text).toContain("reading-pane");
  });

  it("đối chiếu nút gửi: thấy → ghi 'thấy (đối chiếu — extension không kích hoạt)'; miss → 'không thấy'", async () => {
    const seen = await collectDiagnoseReport(makeDeps({ sendPresence: () => true }));
    expect(seen.text).toContain("thấy (đối chiếu — extension không kích hoạt)");
    const absent = await collectDiagnoseReport(makeDeps({ sendPresence: () => false }));
    expect(absent.text).toContain("không thấy");
  });

  it("EF-1: snapshot vượt MAX_REPORT_CHARS → truncated + ghi chú đã cắt", async () => {
    // Nhiều node role-only (không label — không bị redact) đẩy report vượt giới hạn thực tế.
    const lines: string[] = [];
    for (let index = 0; index < 2500; index += 1) lines.push("button (ref_" + String(index + 1) + ")");
    const snapshot = lines.join("\n");
    const report = await collectDiagnoseReport(makeDeps({ snapshotText: snapshot }));
    expect(report.truncated).toBe(true);
    expect(report.text).toContain("ĐÃ CẮT BỚT");
    expect(report.text.length).toBeLessThanOrEqual(MAX_REPORT_CHARS + 100);
  });

  it("layout unknown → ghi EF-2 kèm hướng dẫn thu thập thêm", async () => {
    const report = await collectDiagnoseReport(
      makeDeps({ detect: () => ({ view: "unknown", container: null }) })
    );
    expect(report.text).toContain("unknown (EF-2)");
  });
});

describe("probeAllChains — T1 chain status (UC-09 AF-1)", () => {
  it("fixture DOM: toolbar hit → selector trúng; inbox-item miss → null", () => {
    const main = document.createElement("div");
    main.setAttribute("role", "main");
    const toolbar = document.createElement("div");
    toolbar.setAttribute("role", "toolbar");
    main.appendChild(toolbar);
    document.body.appendChild(main);
    const probes = probeAllChains();
    const toolbarProbe = probes.find((probe) => probe.functionKey === "message-toolbar");
    const itemProbe = probes.find((probe) => probe.functionKey === "inbox-item");
    expect(toolbarProbe?.selector).toContain("toolbar");
    expect(itemProbe?.selector).toBeNull();
    expect(toolbarProbe?.chain).toBe('[role="main"] [role="toolbar"] | [role="toolbar"]');
  });
});
