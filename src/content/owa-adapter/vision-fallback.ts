// src/content/owa-adapter/vision-fallback.ts — Tầng 3 vision (TDD §3.1.3; FR-GD4-05).
// Điều kiện KÉP (BR-03): (1) per-call opt-in — allowVision do caller chủ động truyền (action của
// người dùng); (2) config.vision.enabled === true (lớp 2 content-side; SW VISION_CAPTURE kiểm tra
// lần 3). Cả hai sai → KHÔNG BAO GIỜ có capture nào (test assert 0 RPC khi disabled — §8.7).
// Pipeline: VISION_CAPTURE (SW captureVisibleTab — CS không có chrome.tabs) → nén canvas ~1568px
// JPEG 0.6 → VISION_LOCATE (LLM trả "(x%, y%)", parse fail-closed phía content) → elementFromPoint
// → verifyElement (SR-08). Ảnh CHỈ sống trong memory 1 call — KHÔNG persist storage (BR-05).
import { sendMessage } from "../../shared/messaging";
import { storage } from "../../shared/storage";
import type { VisionLocateRequest } from "../../shared/llm/prompts-vision";
import { verifyElement } from "./locator-expectations";
import type { FunctionKey } from "./selectors";

export const VISION_TARGET_WIDTH = 1568; // pxPerToken ≈ 28 (REFERENCE-ANALYSIS) — nén mạnh
export const VISION_JPEG_QUALITY = 0.6;
const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;
// SR-01 L3 — parse fail-closed: chỉ chấp nhận "(x%, y%)" với 2 số ≤ 100; text khác → null.
// "(x%, y%)" theo prompt; dung sai: % tùy chọn, số thập phân, dấu phân cách , ; khoảng trắng,
// đứng giữa text khác. Range 0..100 kiểm ở parseVisionPoint — ngoài range → null (fail-closed).
const POINT_PATTERN = /\(?\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*[,;\s]\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*\)?/;

export interface VisionPoint {
  xPct: number;
  yPct: number;
}

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface VisionLocateAnswer {
  point: VisionPoint | null;
}

// DI seam (§4.3) — test inject toàn bộ; mặc định đi qua RPC (SW) + canvas + verify thật.
export interface VisionDeps {
  configEnabled: () => Promise<boolean>;
  capture: () => Promise<string>; // dataURL từ SW VISION_CAPTURE
  compress: (dataUrl: string, targetWidth: number) => Promise<CompressedImage>;
  locateRpc: (request: VisionLocateRequest) => Promise<{ text: string }>;
  viewport: () => { width: number; height: number };
  elementAt: (x: number, y: number) => Element | null;
  verify: (functionKey: FunctionKey, el: Element | null) => boolean;
}

export interface VisionLocator {
  resolve(functionKey: FunctionKey, question: string, allowVision?: boolean): Promise<Element | null>;
}

export class VisionFallback implements VisionLocator {
  private readonly deps: VisionDeps;

  constructor(deps: VisionDeps = defaultVisionDeps()) {
    this.deps = deps;
  }

  // T3 chỉ chạy sau khi T1+T2 fail (BR-12 — OwaAdapter gọi sau chain) + điều kiện kép BR-03.
  // allowVision là opt-in PER-CALL: không truyền → false → KHÔNG có capture nào (fail-closed).
  async resolve(functionKey: FunctionKey, question: string, allowVision = false): Promise<Element | null> {
    if (!allowVision) return null; // điều kiện (1) — per-call opt-in
    if (!(await this.deps.configEnabled())) return null; // điều kiện (2) — BR-03, mặc định TẮT
    const captured = await this.deps.capture(); // tới được đây khi cả hai điều kiện đúng
    const image = await this.deps.compress(captured, VISION_TARGET_WIDTH);
    const response = await this.deps.locateRpc(toLocateRequest(functionKey, question, image.dataUrl));
    const point = parseVisionPoint(response.text);
    if (!point) return null; // "null"/text lạ → tier thất bại, không đoán tọa độ
    return this.elementAtPoint(functionKey, point);
  }

  // (x%, y%) tương đối → pixel viewport (CSS px, không nhân devicePixelRatio — hạn chế hiDPI §3.1.3).
  private elementAtPoint(functionKey: FunctionKey, point: VisionPoint): Element | null {
    const size = this.deps.viewport();
    const element = this.deps.elementAt((point.xPct / 100) * size.width, (point.yPct / 100) * size.height);
    if (!element) return null;
    if (!this.deps.verify(functionKey, element)) return null; // SR-08 — sai role/label → tier thất bại
    return element;
  }
}

// SR-01 L3 / BR-16 — parse điểm từ text LLM, fail-closed; không bao giờ execute chuỗi trả về.
export function parseVisionPoint(text: string): VisionPoint | null {
  const match = POINT_PATTERN.exec(text.trim());
  if (!match) return null;
  const xPct = Number(match[1]);
  const yPct = Number(match[2]);
  if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return null;
  return { xPct: xPct, yPct: yPct };
}

// Tách base64 + mediaType từ dataURL — KHÔNG lưu xuống storage/đĩa (§8.7, BR-05).
function toLocateRequest(functionKey: string, question: string, dataUrl: string): VisionLocateRequest {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  return {
    functionKey: functionKey,
    question: question,
    imageBase64: match?.[2] ?? dataUrl,
    mediaType: match?.[1] ?? "image/jpeg"
  };
}

function defaultVisionDeps(): VisionDeps {
  return {
    configEnabled: async () => (await storage.getVision()).enabled,
    // SW gọi captureVisibleTab (CS không có chrome.tabs) — SW tự kiểm tra vision.enabled lần 3.
    capture: async () => (await sendMessage<{ dataUrl: string }>("VISION_CAPTURE", {})).dataUrl,
    compress: compressViaCanvas,
    locateRpc: (request) => sendMessage<{ text: string }>("VISION_LOCATE", request),
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    elementAt: (x, y) => document.elementFromPoint(x, y),
    verify: (functionKey, element) => verifyElement(functionKey, element)
  };
}

// Nén canvas: scale về bề rộng target, JPEG quality 0.6; canvas/context không khả dụng (jsdom,
// chính sách vẽ) → trả ảnh gốc nguyên trạng (vẫn ≤ 1 viewport — KHÔNG chặn luồng T3).
async function compressViaCanvas(dataUrl: string, targetWidth: number): Promise<CompressedImage> {
  const image = await decodeImage(dataUrl);
  const scale = Math.min(1, targetWidth / Math.max(1, image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl: dataUrl, width: image.naturalWidth, height: image.naturalHeight };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", VISION_JPEG_QUALITY), width: canvas.width, height: canvas.height };
}

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("vision: cannot decode capture"));
    image.src = dataUrl;
  });
}
