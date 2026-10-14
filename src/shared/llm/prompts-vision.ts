// src/shared/llm/prompts-vision.ts — prompt vision-locate cho T3 (GĐ4; FR-GD4-05).
// Tách khỏi prompts.ts (6 prompt GĐ2 — contract có test riêng) để không đụng contract cũ.
// Model CHỈ trả "(x%, y%)" — tọa độ phần trăm viewport của phần tử; không tìm thấy → "null".
// SR-01 L1: ANTI_INJECTION_CLAUSE chèn kèm (question là dữ liệu ảnh + câu hỏi người dùng).
import { ANTI_INJECTION_CLAUSE } from "./prompts";
import type { ChatMessage } from "./types";

export interface VisionLocateRequest {
  imageBase64: string;
  mediaType: string;
  functionKey: string;
  question: string;
}

export type VisionPromptLanguage = "vi" | "en";

const SYSTEM_VI =
  "Bạn là trợ lý định vị phần tử giao diện Outlook qua ảnh chụp màn hình. Tìm phần tử được mô tả " +
  "trong yêu cầu và trả về DUY NHẤT tọa độ trung tâm của nó dưới dạng (x%, y%) — phần trăm theo " +
  "bề rộng/cao ảnh. Không tìm thấy → chỉ trả chữ null. KHÔNG giải thích, KHÔNG thêm chữ khác.";
const SYSTEM_EN =
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

// Mô tả phần tử theo functionKey (ngôn ngữ theo uiLanguage — không phụ thuộc ảnh).
export function visionElementDescription(functionKey: string, language: VisionPromptLanguage): string {
  const entry = ELEMENT_DESCRIPTIONS[functionKey];
  if (entry) return language === "en" ? entry.en : entry.vi;
  return language === "en" ? "the requested element: " + functionKey : "phần tử được yêu cầu: " + functionKey;
}

// Prompt T3 — question do caller cung cấp (tiếng theo caller); ảnh đi qua ChatOptions.visionImage.
export function buildVisionMessages(request: VisionLocateRequest, language: VisionPromptLanguage = "vi"): ChatMessage[] {
  const system = (language === "en" ? SYSTEM_EN : SYSTEM_VI) + "\n\n" + ANTI_INJECTION_CLAUSE;
  const target = visionElementDescription(request.functionKey, language);
  const question = request.question.length > 0 ? " (" + request.question + ")" : "";
  return [
    { role: "system", content: system },
    { role: "user", content: "Tìm: " + target + question + ". Trả về (x%, y%) hoặc null." }
  ];
}
