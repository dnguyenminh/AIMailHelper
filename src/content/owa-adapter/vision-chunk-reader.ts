// src/content/owa-adapter/vision-chunk-reader.ts — UAT 18/10: đọc tài liệu dài theo chunk,
// tóm tắt từng chunk (progressive summarization), cuối cùng tổng hợp.
// Không đọc hết 1 lần (tránh context tràn) — đọc chunk → tóm tắt → lưu → chunk tiếp.

import { sendMessage } from "../../shared/messaging";

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

// Capture TẤT CẢ trang trong preview (cuộn đến cuối) — dùng DEBUGGER_SCROLL
async function captureAllPages(): Promise<string[]> {
  const pages: string[] = [];
  let lastPageCount = 0;
  let stagnantCount = 0;

  // Scroll về đầu trước
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog) {
    const firstPage = dialog.querySelector('[role="option"], [role="listitem"]');
    if (firstPage) {
      (firstPage as HTMLElement).scrollIntoView({ block: "start" });
      await new Promise((r) => setTimeout(r, 1500)); // Tăng thời gian chờ render
    }
  }

  for (let scroll = 0; ; scroll += 1) {
    const shot = await sendMessage<{ dataUrl: string }>("VISION_CAPTURE", {});
    if (shot?.dataUrl) pages.push(shot.dataUrl);

    if (pages.length === lastPageCount) {
      stagnantCount += 1;
      if (stagnantCount >= 3) break;
    } else {
      stagnantCount = 0;
      lastPageCount = pages.length;
    }

    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) break;
    const rect = dialog.getBoundingClientRect();
    await sendMessage("DEBUGGER_SCROLL", {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      deltaY: 1200,
      times: 2
    });
    await new Promise((r) => setTimeout(r, 1500)); // Tăng thời gian chờ giữa các lần cuộn
  }
  return pages;
}

export async function readFullDocumentVision(
  _fileName: string,
  onProgress?: (phase: string, current: number, total: number) => void
): Promise<{ synthesis: VisionSynthesisResult; chunks: ChunkSummary[] }> {
  // 1. Capture TẤT CẢ trang
  const allPages = await captureAllPages();
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