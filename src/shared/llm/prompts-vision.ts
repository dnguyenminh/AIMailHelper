// src/shared/llm/prompts-vision.ts — thêm prompt chunk summarization + final synthesis
// UAT 18/10: chunked vision-read cho tài liệu dài

import { ANTI_INJECTION_CLAUSE } from "./prompts";
import type { ChatMessage } from "./types";
import type { PromptLanguage } from "./prompts";

export type VisionPromptLanguage = PromptLanguage;

// GĐ4 T3 locator (FR-GD4-05) — vision locate element từ ảnh.
// Request: ảnh base64 + functionKey + question.
export interface VisionLocateRequest {
  imageBase64: string;
  mediaType: string;
  functionKey: string;
  question: string;
}

// GĐ4 T3 locator — prompt định vị element từ ảnh (FR-GD4-05).
// Model CHỈ trả "(x%, y%)" — tọa độ phần trăm viewport của phần tử; không tìm thấy → "null".
const LOCATE_SYSTEM_VI =
  "Bạn là trợ lý định vị phần tử giao diện Outlook qua ảnh chụp màn hình. Tìm phần tử được mô tả " +
  "trong yêu cầu và trả về DUY NHẤT tọa độ trung tâm của nó dưới dạng (x%, y%) — phần trăm theo " +
  "bề rộng/cao ảnh. Không tìm thấy → chỉ trả chữ null. KHÔNG giải thích, KHÔNG thêm chữ khác.";
const LOCATE_SYSTEM_EN =
  "You are an Outlook UI element locator working from a screenshot. Find the element described in " +
  "the request and return EXACTLY the centre coordinates as (x%, y%) — percentages of the image " +
  "width/height. When not found, return only the word null. No explanations, nothing else.";

const ELEMENT_DESCRIPTIONS: Record<string, { vi: string; en: string }> = {
  "reading-pane": { vi: "vùng đọc nội dung email đang mở", en: "the reading pane showing the opened email" },
  "message-toolbar": { vi: "thanh công cụ hành động của email", en: "the email action toolbar" },
  "reply-button": { vi: "nút Trả lời (Reply)", en: "the Reply button" },
  "compose-box": { vi: "khung soạn thảo trả lời (ô nhập nội dung)", en: "the reply compose text box" },
  "inbox-list": { vi: "danh sách thư trong hộp thư", en: "the inbox message list" },
  "inbox-item": { vi: "hàng email trong danh sách", en: "a message row in the list" }
};

export function visionElementDescription(functionKey: string, language: VisionPromptLanguage): string {
  const entry = ELEMENT_DESCRIPTIONS[functionKey];
  if (entry) return language === "en" ? entry.en : entry.vi;
  return language === "en" ? "the requested element: " + functionKey : "phần tử được yêu cầu: " + functionKey;
}

export function buildVisionMessages(request: VisionLocateRequest, language: VisionPromptLanguage = "vi"): ChatMessage[] {
  const system = language === "en" ? LOCATE_SYSTEM_EN : LOCATE_SYSTEM_VI;
  const desc = visionElementDescription(request.functionKey, language);
  const user = `Tìm ${desc}. Câu hỏi: ${request.question}`;
  return [
    { role: "system", content: system + "\n\n" + ANTI_INJECTION_CLAUSE },
    { role: "user", content: user }
  ];
}

// UAT 18/10 — Vision-read attachment (Word/Excel preview render ẢNH TRANG): OCR 1 trang/call.
const OCR_SYSTEM_VI =
  "Bạn đọc ảnh chụp màn hình của trang tài liệu (Word/Excel). Trích TOÀN BỘ text hiển thị " +
  "trong ảnh, giữ nguyên thứ tự. Chỉ trả về text — KHÔNG giải thích, KHÔNG nhận xét, KHÔNG thêm tiêu đề.";

export function buildVisionOcrMessages(pageIndex: number, totalPages: number): ChatMessage[] {
  const user =
    totalPages > 1
      ? `Trang ${pageIndex + 1}/${totalPages}. Trích toàn bộ text trong ảnh.`
      : "Trích toàn bộ text trong ảnh.";
  return [
    { role: "system", content: OCR_SYSTEM_VI + "\n\n" + ANTI_INJECTION_CLAUSE },
    { role: "user", content: user }
  ];
}

// UAT 18/10 — CHUNK SUMMARIZATION: tóm tắt 1 chunk (nhiều trang) để sau tổng hợp.
// Output: JSON có 2 trường: summary (tóm tắt 500-1000 từ), keyPoints (mảng 5-10 điểm chính).
const CHUNK_SUMMARY_SYSTEM_VI =
  "Bạn là chuyên gia tóm tắt tài liệu. Nhận text của 1 đoạn tài liệu (chunk). " +
  "Trả về DUY NHẤT 1 JSON block: { summary: string, keyPoints: string[] }. " +
  "summary: tóm tắt 500-1000 từ, bao gồm chủ đề, đối tượng, số liệu quan trọng, kết luận. " +
  "keyPoints: 5-10 điểm chính (mỗi điểm ≤ 200 ký tự). " +
  "KHÔNG markdown, KHÔNG giải thích thêm.";

export function buildVisionChunkSummaryMessages(chunkIndex: number, totalChunks: number): ChatMessage[] {
  const user =
    totalChunks > 1
      ? `Chunk ${chunkIndex + 1}/${totalChunks}. Tóm tắt đoạn này để sau này tổng hợp toàn bộ tài liệu.`
      : "Tóm tắt toàn bộ tài liệu (chỉ có 1 chunk).";
  return [
    { role: "system", content: CHUNK_SUMMARY_SYSTEM_VI + "\n\n" + ANTI_INJECTION_CLAUSE },
    { role: "user", content: user }
  ];
}

// UAT 18/10 — FINAL SYNTHESIS: tổng hợp từ các chunk summaries thành báo cáo hoàn chỉnh.
// Input: mảng { chunkIndex, summary, keyPoints }. Output: JSON { overview, details, conclusions, actionItems }.
const SYNTHESIS_SYSTEM_VI =
  "Bạn là chuyên gia tổng hợp báo cáo. Nhận các tóm tắt của các chunk (đoạn) tài liệu. " +
  "Trả về DUY NHẤT 1 JSON block: " +
  "{ overview: string, details: string, conclusions: string, actionItems: string[] }. " +
  "overview: tóm tắt toàn bộ 200-300 từ. details: chi tiết 1000-2000 từ. " +
  "conclusions: kết luận 300-500 từ. actionItems: 3-7 mục cần làm (mỗi ≤ 200 ký tự). " +
  "KHÔNG markdown, KHÔNG giải thích thêm.";

export function buildVisionSynthesisMessages(chunkCount: number): ChatMessage[] {
  return [
    { role: "system", content: SYNTHESIS_SYSTEM_VI + "\n\n" + ANTI_INJECTION_CLAUSE },
    { role: "user", content: `Tổng hợp ${chunkCount} chunk summaries thành báo cáo hoàn chỉnh.` }
  ];
}

