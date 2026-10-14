// src/shared/llm/vision-wire.ts — serialize ChatOptions.visionImage thành content đa phương thức
// theo wire format từng provider (GĐ4 — FR-GD4-05; ChatOptions.visionImage FSD 5.1 "chỉ T3 dùng").
// ADDITIVE + GATED: helpers CHỈ được gọi khi opts.visionImage có mặt (T3 opt-in BR-03) — mọi call
// text-only GĐ2 đi đường cũ không đổi (199 test GĐ2/3 giữ nguyên là regression guard).
// Ảnh KHÔNG BAO GIỜ được log/serialize vào error (chỉ nằm trong request body 1 lần — BR-05/BR-08).

type Json = Record<string, unknown>;

export interface VisionImage {
  base64: string;
  mediaType: string;
}

function lastMessage(list: unknown): Json | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const last = list[list.length - 1];
  return typeof last === "object" && last !== null ? (last as Json) : null;
}

function lastText(message: Json): string {
  return typeof message["content"] === "string" ? message["content"] : "";
}

// OpenAI family (openai/azure/openai-compatible/local): content = [{type:text}, {type:image_url}].
export function applyOpenAIImage(body: Json, image: VisionImage): void {
  const message = lastMessage(body["messages"]);
  if (!message) return;
  message["content"] = [
    { type: "text", text: lastText(message) },
    { type: "image_url", image_url: { url: "data:" + image.mediaType + ";base64," + image.base64 } }
  ];
}

// Anthropic: content block {type:image, source:{type:base64, media_type, data}} (5.2.3).
export function applyAnthropicImage(body: Json, image: VisionImage): void {
  const message = lastMessage(body["messages"]);
  if (!message) return;
  message["content"] = [
    { type: "text", text: lastText(message) },
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }
  ];
}

// Gemini: part {inline_data:{mime_type, data}} nối vào parts của content cuối (5.2.4).
export function applyGeminiImage(body: Json, image: VisionImage): void {
  const content = lastMessage(body["contents"]);
  if (!content) return;
  const parts = Array.isArray(content["parts"]) ? (content["parts"] as Json[]) : [];
  parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
  content["parts"] = parts;
}
