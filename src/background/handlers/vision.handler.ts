// src/background/handlers/vision.handler.ts — VISION_CAPTURE + VISION_LOCATE (T3; FR-GD4-05; BR-03).
// captureVisibleTab CHỈ gọi được từ SW (content script không có chrome.tabs) → RPC ở đây.
// Điều kiện kép lớp 3: vision.enabled=false → từ chối (BR-03; lớp 1 toggle Options, lớp 2 content).
// VISION_LOCATE: adapter GĐ2 nhận ảnh qua ChatOptions.visionImage — parse (x%,y%) ở content.
import { AppError } from "../../shared/errors";
import type { RpcHandler } from "../router";
import type { MessageRouter } from "../router";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { storage } from "../../shared/storage";
import { resolveActive } from "../llm-runtime";
import { buildVisionMessages } from "../../shared/llm/prompts-vision";
import type { VisionLocateRequest } from "../../shared/llm/prompts-vision";

export function registerVisionHandlers(router: MessageRouter): void {
  router.register("VISION_CAPTURE", handleVisionCapture);
  router.register("VISION_LOCATE", handleVisionLocate);
}

// BR-03 — tắt → ERR-15 (không có capture nào rời máy); bật → dataURL (KHÔNG persist — §8.7).
const handleVisionCapture: RpcHandler = async (): Promise<{ dataUrl: string }> => {
  const vision = await storage.getVision();
  if (!vision.enabled) throw new AppError("ERR-15", "errors.badRequest", { field: "vision", allowed: "enabled" });
  // WINDOW_ID_CURRENT — tab hiện tại thuộc 3 domain OWA (host_permissions có sẵn — §8.3).
  const dataUrl = await chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "jpeg", quality: 100 });
  return { dataUrl: dataUrl };
};

const handleVisionLocate: RpcHandler = async (payload): Promise<{ text: string }> => {
  const request = parseVisionLocate(payload);
  const active = await resolveActive(); // ERR-11 khi chưa cấu hình
  await ensureHostPermission(active.config); // BR-05 — provider cloud cần quyền host
  const response = await active.adapter.chat(active.config, buildVisionMessages(request), {
    temperature: 0, // deterministic — tọa độ (§15.2 #6)
    maxTokens: 64,
    visionImage: { base64: request.imageBase64, mediaType: request.mediaType } // GĐ2 ChatOptions
  });
  return { text: response.text };
};

function parseVisionLocate(payload: unknown): VisionLocateRequest {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const imageBase64 = raw["imageBase64"];
  const functionKey = raw["functionKey"];
  if (typeof imageBase64 !== "string" || imageBase64.length === 0 || typeof functionKey !== "string") {
    throw new AppError("ERR-15", "errors.badRequest", { field: "imageBase64|functionKey" });
  }
  const mediaType = typeof raw["mediaType"] === "string" ? raw["mediaType"] : "image/jpeg";
  const question = typeof raw["question"] === "string" ? raw["question"] : "";
  return { imageBase64: imageBase64, mediaType: mediaType, functionKey: functionKey, question: question };
}
