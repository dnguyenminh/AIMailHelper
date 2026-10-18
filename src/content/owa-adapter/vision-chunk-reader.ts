// src/content/owa-adapter/vision-chunk-reader.ts — UAT 18/10: đọc tài liệu dài theo chunk,
// tóm tắt từng chunk (progressive summarization), cuối cùng tổng hợp.
// Không đọc hết 1 lần (tránh context tràn) — đọc chunk → tóm tắt → lưu → chunk tiếp.

import { sendMessage } from "../../shared/messaging";

const CHUNK_PAGES = 10;           // số trang / chunk (mặc định 10 trang)
const CHUNK_OVERLAP = 1;          // trang chồng giữa chunks (đảm bảo không mất context biên)
const MAX_CHUNKS = 4;             // tối đa 4 chunks (40 trang)

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
      await new Promise((r) => setTimeout(r, 500));
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
    await new Promise((r) => setTimeout(r, 800));
  }
  return pages;
}

// Chia mảng pages thành các chunks (có overlap)
function splitIntoChunks<T>(arr: T[], chunkSize: number, overlap: number): T[][] {
  const chunks: T[][] = [];
  let start = 0;
  while (start < arr.length) {
    const end = Math.min(start + chunkSize, arr.length);
    chunks.push(arr.slice(start, end));
    if (end === arr.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ChunkSummary và VisionSynthesisResult đã khai báo ở trên
// Implementation đầy đủ sẽ ở attachment.handler.ts
export async function readFullDocumentVision(
  _fileName: string,
  onProgress?: (phase: string, current: number, total: number) => void
): Promise<{ synthesis: any; chunks: any[] }> {
  // 1. Capture TẤT CẢ trang
  const allPages = await captureAllPages();
  if (allPages.length === 0) throw new Error("Không capture được trang nào");

  // 2. Chia chunks (có overlap)
  const chunks = splitIntoChunks(allPages, CHUNK_PAGES, CHUNK_OVERLAP).slice(0, MAX_CHUNKS);

  // 2. Tóm tắt từng chunk (sequential)
  const chunkSummaries: any[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.("summarize-chunk", i + 1, chunks.length);
    // TODO: call LLM summarizeChunk(chunks[i], i, chunks.length)
    chunkSummaries.push({ chunkIndex: i, summary: "", keyPoints: [], pageRange: { from: i * 10, to: Math.min((i + 1) * 10, 40) } });
  }

  // 4. Tổng hợp
  // TODO: call LLM synthesizeChunks
  return { synthesis: { overview: "", details: "", conclusions: "", actionItems: [] }, chunks: chunkSummaries };
}