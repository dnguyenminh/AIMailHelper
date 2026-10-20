// src/content/owa-adapter/diagnose-uat-sections.ts — các SPIKE section chuẩn UAT (20/10):
// PREVIEW IFRAMES (CDP) / PREVIEW DIALOG (DOM content) / COPILOT (cấu trúc). Mỗi builder nhận
// dep phụ năng — chờ định dạng lỗi an toàn, nội dung đã redact phía caller (M-2).

export interface FrameProbe {
  url: string;
  attached: boolean;
  imgCount: number;
  ids: string[];
  samples: string[];
  main?: boolean;
  via?: string;
  tree?: string[];
  error?: string;
}

function failNote(error: unknown): string {
  return "(không probe được: " + String(error).replace(/^Error: /, "").slice(0, 120) + ")";
}

// CDP IMG probe: cấu trúc iframe preview + ảnh trang (src đã redact phía SW — M-2).
export async function previewProbeSection(probeFn: () => Promise<FrameProbe[]>): Promise<string> {
  try {
    const frames = await probeFn();
    const lines = frames.map((frame, index) => {
      const parts = ["iframe #" + String(index) + ": url=" + frame.url, "attached=" + String(frame.attached), "imgs=" + String(frame.imgCount)];
      if (frame.main === true) parts[0] = "TRANG CHÍNH [" + String(index) + "]: url=" + frame.url;
      if (frame.via !== undefined) parts.push("via=" + frame.via);
      if (frame.ids.length > 0) parts.push("ids=[" + frame.ids.join(",") + "]");
      if (frame.samples.length > 0) parts.push("srcs=" + frame.samples.join(" | "));
      if (frame.error !== undefined) parts.push("ERROR=" + frame.error);
      const subLines = (frame.tree ?? []).map((line) => "    ▸ " + line);
      return parts.join(" ") + (subLines.length > 0 ? "\n" + subLines.join("\n") : "");
    });
    return "--- SPIKE: PREVIEW IFRAMES — CDP IMG PROBE (M-2: src đã redact query/token) ---\n" + (lines.join("\n") || "(không có iframe target nào — MỞ dialog preview Word TRƯỚC khi chạy Diagnose; imgs=0 khi preview mở là dữ liệu)");
  } catch (error) {
    return "--- SPIKE: PREVIEW IFRAMES — CDP IMG PROBE ---\n" + failNote(error);
  }
}

// Preview dialog (Fluent DialogSurface) TRỰC TIẾP từ DOM content — nhanh, redact sẵn.
export function previewDialogSection(linesFn: () => string[]): string {
  try {
    return "--- SPIKE: PREVIEW DIALOG (fui-DialogSurface — DOM content, M-2 redact) ---\n" + linesFn().join("\n");
  } catch (error) {
    return "--- SPIKE: PREVIEW DIALOG ---\n" + failNote(error);
  }
}

// Copilot thay LLM+VL (user quyết): trạng thái entry/popup/panel + CDP read — chỉ cấu trúc +
// textLen; nội dung chat ẨN per M-2/EF-3 (report không mang text email/summary).
export async function copilotSection(linesFn: () => Promise<string[]>): Promise<string> {
  try {
    return "--- SPIKE: COPILOT (GĐ-A — cấu trúc; nội dung ẩn per M-2) ---\n" + (await linesFn()).join("\n");
  } catch (error) {
    return "--- SPIKE: COPILOT ---\n" + failNote(error);
  }
}
