// src/content/owa-adapter/vision-chunk-reader.ts — UAT 18/10: đọc tài liệu dài theo chunk,
// tóm tắt từng chunk (progressive summarization), cuối cùng tổng hợp.
// Không đọc hết 1 lần (tránh context tràn) — đọc chunk → tóm tắt → lưu → chunk tiếp.

import { sendMessage } from "../../shared/messaging";
import { collectDialogImages } from "./preview-dialog";
import { analyzeViaCopilot } from "./copilot-bridge";

const CONTENT_FETCH_DEPS = { fetchImpl: fetch, FileReaderCtor: FileReader }; // page context

export interface ChunkSummary {
  chunkIndex: number;
  summary: string;
  keyPoints: string[];
  pageRange: { from: number; to: number };
}

export interface VisionSynthesisResult {
  overview: string;
  details: string;
  conclusions: string;
  actionItems: string[];
}

const MAX_CAPTURE_PAGES = 10; // tài liệu dài — SW còn cắt MAX_VISION_PAGES=4 phía handler
const SETTLE_MS = 1500;

// Capture TẤT CẢ trang trong preview (cuộn đến cuối) — dùng DEBUGGER_SCROLL.
// Dừng khi: ảnh trùng lần trước (hết nội dung mới) | dialog đóng | đủ MAX_CAPTURE_PAGES.
// (Bug cũ: so pages.length luôn tăng → stagnant không bao giờ đạt → lặp vô hạn khi dialog mở.)
async function captureAllPages(): Promise<string[]> {
  const pages: string[] = [];

  // Scroll về đầu trước
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog) {
    const firstPage = dialog.querySelector('[role="option"], [role="listitem"]');
    if (firstPage) {
      (firstPage as HTMLElement).scrollIntoView({ block: "start" });
      await new Promise((r) => setTimeout(r, SETTLE_MS)); // chờ render
    }
  }

  for (let scroll = 0; scroll < MAX_CAPTURE_PAGES; scroll += 1) {
    const shot = await sendMessage<{ dataUrl: string }>("VISION_CAPTURE", {});
    const dataUrl = shot?.dataUrl ?? "";
    if (dataUrl.length === 0) break;
    if (pages[pages.length - 1] === dataUrl) break; // ảnh trùng → hết nội dung mới
    pages.push(dataUrl);

    const currentDialog = document.querySelector('[role="dialog"]');
    if (!currentDialog) break;
    const rect = currentDialog.getBoundingClientRect();
    await sendMessage("DEBUGGER_SCROLL", {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      deltaY: 1200,
      times: 2
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS)); // chờ render giữa các lần cuộn
  }
  return pages;
}

// UAT 20/10 — collect ảnh trang: LỚP 1 = dialog shell (DOM content, ảnh trên trang chính),
// LỚP 2 = CDP iframe qua SW RPC, cuộn dần để trigger lazy-load. Dừng: hết ảnh mới | dialog đóng.
async function collectPreviewImages(): Promise<string[]> {
  const seen = new Set<string>();
  for (let round = 0; round < MAX_CAPTURE_PAGES; round += 1) {
    const before = seen.size; // đếm trước khi collect — dùng kiểm tra "hết ảnh mới" bên dưới
    // LỚP 1 — img trong dialog shell (không đi qua SW, tận dụng fetch page context)
    for (const src of await collectDialogImages(CONTENT_FETCH_DEPS)) seen.add(src);
    // LỚP 2 — CDP iframe (nếu ảnh nằm trong iframe cross-origin)
    const response = await sendMessage<{ images: string[] }>("ATTACHMENT_READ_PREVIEW_IMAGES", {});
    for (const src of response.images ?? []) seen.add(src);
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) break;
    if (round > 0 && seen.size === before) break; // cuộn mà không có ảnh mới → đã đủ trang
    const rect = dialog.getBoundingClientRect();
    await sendMessage("DEBUGGER_SCROLL", {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      deltaY: 1200,
      times: 2
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS)); // chờ lazy-load ảnh trang kế
  }
  return Array.from(seen);
}

export async function readFullDocumentVision(
  _fileName: string,
  onProgress?: (phase: string, current: number, total: number) => void
): Promise<{ synthesis: VisionSynthesisResult; chunks: ChunkSummary[] }> {
  // GĐ-B (20/10) — Copilot THAY LLM+VL (user quyết): trigger "Summarize this email" + đọc text
  // panel. Fail (không license/panel chết/timeout) → null → pipeline vision cũ làm fallback.
  onProgress?.("copilot", 0, 1);
  const copilot = await analyzeViaCopilot();
  if (copilot !== null) {
    onProgress?.("copilot", 1, 1);
    const synthesis: VisionSynthesisResult = {
      overview: copilot.text,
      details: "",
      conclusions: "",
      actionItems: []
    };
    return {
      synthesis: synthesis,
      chunks: [{ chunkIndex: 0, summary: copilot.text, keyPoints: [], pageRange: { from: 1, to: 1 } }]
    };
  }

  // 1. Ưu tiên EXTRACT ảnh gốc từ iframe (full-res, không cần tab visible); fallback screenshot.
  let allPages = await collectPreviewImages();
  if (allPages.length === 0) allPages = await captureAllPages();
  if (allPages.length === 0) throw new Error("Không capture được trang nào");

  // 2. Gửi TẤT CẢ pages đến handler để OCR + chunked summarization + synthesis
  onProgress?.("vision-ocr", 0, allPages.length);
  const visionJobs = [{ name: "document", pages: allPages }];
  const visionResponse = await sendMessage<{ results: { name: string; text?: string; error?: string }[] }>("ATTACHMENT_VISION_TEXT", { files: visionJobs });
  
  if (visionResponse.results[0]?.error === "no-vision-model") {
    throw new Error("no-vision-model");
  }
  if (visionResponse.results[0]?.error) {
    throw new Error("vision-failed");
  }
  
  const visionText = visionResponse.results[0]?.text ?? "";
  
  // Parse the returned text into synthesis structure
  const synthesis: VisionSynthesisResult = {
    overview: visionText,
    details: "",
    conclusions: "",
    actionItems: []
  };
  
  return { 
    synthesis, 
    chunks: [{ chunkIndex: 0, summary: visionText, keyPoints: [], pageRange: { from: 1, to: allPages.length } }]
  };
}