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
const handleVisionCapture: RpcHandler = async (_payload, sender): Promise<{ dataUrl: string }> => {
  const vision = await storage.getVision();
  if (!vision.enabled) throw new AppError("ERR-15", "errors.badRequest", { field: "vision", allowed: "enabled" });
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  // Đảm bảo tab OWA đang ACTIVE + window focused TRƯỚC khi chụp (UAT 20/10: active tab trong
  // window có thể là chrome://extensions/DevTools → captureVisibleTab fail "Cannot access").
  if (typeof tabId === "number") await chrome.tabs.update(tabId, { active: true });
  if (typeof windowId === "number") await chrome.windows.update(windowId, { focused: true });
  await new Promise((r) => setTimeout(r, 300)); // chờ composite sau khi switch tab/window
  try {
    return { dataUrl: await captureVisible(windowId ?? chrome.windows.WINDOW_ID_CURRENT) };
  } catch (error) {
    console.warn("[AIMH][vision] captureVisibleTab lỗi:", String(error).slice(0, 200));
    if (typeof windowId === "number") {
      await new Promise((r) => setTimeout(r, 500)); // retry 1 lần — đã chắc tab active + focused
      try {
        return { dataUrl: await captureVisible(windowId) };
      } catch (retryError) {
        console.warn("[AIMH][vision] retry vẫn lỗi:", String(retryError).slice(0, 200));
      }
    }
    throw new AppError("ERR-15", "errors.badRequest", { field: "captureVisibleTab", reason: String(error).slice(0, 150) });
  }
};

function captureVisible(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 100 });
}

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
