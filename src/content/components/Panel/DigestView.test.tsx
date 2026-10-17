// src/content/components/Panel/DigestView.test.tsx — UC-04 UI (GĐ5): EF-1 cache trống → hướng dẫn
// "Chạy Triage inbox trước" + nút bấm nhanh; Digest sort giảm dần + reason hiển thị (FR-GD5-04);
// EF-5 overflow → nút "Quét tiếp"; progress/failed/folderStopped notes; AF-2 nút "Quét lại".
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DigestView } from "./DigestView";
import type { TriageUiState } from "../../modules/digest";

const base: TriageUiState = {
  status: "idle", progress: { done: 0, total: 0, failed: 0 }, cachedSkipped: 0, cap: 50,
  overflow: 0, folderStopped: false, userStopped: false, error: null, digest: []
};

function renderView(state: TriageUiState): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <DigestView state={state} onStart={vi.fn()} onScanMore={vi.fn()} onRescan={vi.fn()} onStop={vi.fn()} />
    );
  });
  return host;
}

describe("DigestView — UC-04 (FR-GD5-04/05; EF-1/EF-5)", () => {
  it("EF-1: cache trống + idle → hướng dẫn 'Chạy Triage inbox trước' + nút bấm nhanh UC-03", () => {
    const host = renderView(base);
    expect(host.textContent).toContain("Chưa có kết quả sàng lọc");
    expect(host.textContent).toContain("Sàng lọc hộp thư");
    expect(host.querySelectorAll("button").length).toBeGreaterThanOrEqual(2); // nút chính + nút EF-1
  });

  it("Digest hiển thị subject + score + reason, sort giảm dần + màu badge theo score", () => {
    const state: TriageUiState = {
      ...base,
      progress: { done: 3, total: 3, failed: 0 },
      digest: [
        { messageId: "1", subject: "Hạn chót báo giá", sender: "a@x.vn", score: 85, reason: "Hạn hôm nay" },
        { messageId: "2", subject: "Nhắc lịch họp", sender: "b@x.vn", score: 55, reason: "Cần xác nhận" },
        { messageId: "3", subject: "Newsletter", sender: "c@x.vn", score: 10, reason: "Thông tin chung" }
      ]
    };
    const host = renderView(state);
    expect(host.textContent).not.toContain("Chưa có kết quả Triage"); // không còn EF-1
    const items = host.querySelectorAll(".aimh-digest-list li");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("Hạn chót báo giá"); // 85 đầu tiên (FR-GD5-04)
    expect(items[0]?.textContent).toContain("Hạn hôm nay"); // reason hiển thị
    expect(items[0]?.querySelector(".aimh-badge")?.className).toContain("aimh-badge-high"); // đỏ ≥70
    expect(items[1]?.querySelector(".aimh-badge")?.className).toContain("aimh-badge-medium"); // cam 40-69
    expect(items[2]?.querySelector(".aimh-badge")?.className).toContain("aimh-badge-low"); // xanh <40
    expect(items[0]?.querySelector(".aimh-badge")?.textContent).toBe("85");
  });

  it("EF-5: overflow → 'Còn N email chưa quét' + nút 'Quét tiếp'; EF-3 failed note; EF-2 folder note", () => {
    const state: TriageUiState = {
      ...base,
      progress: { done: 50, total: 60, failed: 2 },
      cachedSkipped: 3,
      overflow: 10,
      folderStopped: true,
      digest: [{ messageId: "1", subject: "S", sender: "a@x.vn", score: 5, reason: "r" }]
    };
    const host = renderView(state);
    expect(host.textContent).toContain("Còn 10 email chưa quét (giới hạn 50"); // EF-5
    expect(host.textContent).toContain("Quét tiếp");
    expect(host.textContent).toContain("2 email chưa chấm được"); // EF-3
    expect(host.textContent).toContain("đổi folder"); // EF-2/EF-4
    expect(host.textContent).toContain("Bỏ qua 3 email đã có trong cache"); // BR-09 note
    expect(host.textContent).toContain("Quét lại (bỏ cache)"); // AF-2
  });

  it("running → nút chính disabled + nhãn tiến độ; nút Dừng hiển thị", () => {
    const state: TriageUiState = { ...base, status: "running", progress: { done: 5, total: 20, failed: 0 } };
    const host = renderView(state);
    const buttons = Array.from(host.querySelectorAll("button"));
    const main = buttons.find((b) => b.textContent?.includes("Đang quét hộp thư… 5/20"));
    expect(main?.disabled).toBe(true);
    expect(buttons.some((b) => b.textContent === "Dừng quét")).toBe(true);
  });
});
