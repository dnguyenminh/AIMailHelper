// src/background/handlers/attachment.handler.ts — UAT 18/10 Plan A (đọc attachment cho AI).
// ATTACHMENT_CAPTURE_START/COLLECT: bật/ngắt "nghe" bytes OWA tự tải khi mở preview.
// ATTACHMENT_EXTRACT: binary (base64) → text (txt/csv/docx/xlsx/pdf) — chạy trong SW vì
// pdf.js fake-worker hoạt động ở đây. Tab LUÔN từ sender.tab — không nhận tabId từ payload.
import { AppError } from "../../shared/errors";
import { extractAttachmentText } from "../../shared/attachments/extract";
import { collectCapture, registerCaptureListener, startCapture } from "../attachment-capture";
import { readPreviewText } from "../preview-reader";
import { resolveActive } from "../llm-runtime";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { storage } from "../../shared/storage";
import { buildVisionOcrMessages } from "../../shared/llm/prompts-vision";
import { resolveVisionModel } from "../../shared/llm/vision-model";
import type { MessageRouter, RpcHandler } from "../router";

const MAX_VISION_FILES = 3;
const MAX_VISION_PAGES = 4; // tối ưu chi phí/context: 4 trang đầu — trang còn lại ghi chú
const MAX_PAGE_B64 = 2_600_000; // ~2MB ảnh jpeg/base64

const MAX_EXTRACT_FILES = 5;

function senderTab(sender: unknown): { tabId: number; url: string | undefined } {
  const tab = (sender as { tab?: { id?: number; url?: string } } | undefined)?.tab;
  if (!tab || typeof tab.id !== "number") throw new AppError("ERR-15", "errors.badRequest");
  return { tabId: tab.id, url: tab.url };
}

interface FilePayload {
  name: string;
  base64: string;
}

function parseFilePayloads(payload: unknown): FilePayload[] {
  const files = (payload as { files?: unknown } | undefined)?.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_EXTRACT_FILES) {
    throw new AppError("ERR-15", "errors.badRequest");
  }
  return files.map((f) => {
    const item = f as { name?: unknown; base64?: unknown };
    if (typeof item.name !== "string" || item.name.length === 0 || item.name.length > 260 ||
      typeof item.base64 !== "string" || item.base64.length === 0 || item.base64.length > 4_200_000) {
      throw new AppError("ERR-15", "errors.badRequest");
    }
    return { name: item.name, base64: item.base64 };
  });
}

const startHandler: RpcHandler = async (_payload, sender) => {
  const { tabId, url } = senderTab(sender);
  await startCapture(tabId, url);
  return { capturing: true };
};

const collectHandler: RpcHandler = async (_payload, sender) => {
  const { tabId } = senderTab(sender);
  return { files: await collectCapture(tabId) };
};

const extractHandler: RpcHandler = async (payload) => {
  const files = parseFilePayloads(payload);
  const results = [];
  for (const file of files) {
    try {
      results.push({ name: file.name, text: await extractAttachmentText(file.name, file.base64) });
    } catch (error) {
      console.warn("[AIMH][attachment] extract fail:", file.name.slice(0, 60), String(error).slice(0, 120));
      results.push({ name: file.name, error: "unsupported-or-corrupt" });
    }
  }
  return { results: results };
};

// UAT 18/10 (user): preview Word/Excel RENDER text trong iframe Office Online — đọc text
// đã render qua debugger DOMSnapshot (chỉ-đọc). Tab LUÔN từ sender.tab như các handler khác.
const readPreviewHandler: RpcHandler = async (_payload, sender) => {
  const { tabId, url } = senderTab(sender);
  return { text: await readPreviewText(tabId, url) };
};

// UAT 18/10 (user): preview Word/Excel render ẢNH TRANG — không có text DOM. Vision-read:
// OCR TỪNG TRANG ảnh qua model VL. Model resolution theo rule user: vision.model (VL riêng)
// → model text nếu hỗ trợ VL → KHÔNG model → bỏ qua (ghi rõ để AI báo user).
interface VisionPageFile {
  name: string;
  pages: string[]; // dataURL jpeg từ captureVisibleTab
}

function parseVisionFiles(payload: unknown): VisionPageFile[] {
  const files = (payload as { files?: unknown } | undefined)?.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_VISION_FILES) {
    throw new AppError("ERR-15", "errors.badRequest");
  }
  return files.map((f) => {
    const item = f as { name?: unknown; pages?: unknown };
    const pages = Array.isArray(item.pages) ? item.pages.filter((p): p is string =>
      typeof p === "string" && p.length > 0 && p.length < MAX_PAGE_B64) : [];
    if (typeof item.name !== "string" || item.name.length === 0 || item.name.length > 260 || pages.length === 0) {
      throw new AppError("ERR-15", "errors.badRequest");
    }
    return { name: item.name, pages: pages.slice(0, MAX_VISION_PAGES) };
  });
}

function base64FromDataUrl(dataUrl: string): string {
  const marker = "base64,";
  const index = dataUrl.indexOf(marker);
  return index >= 0 ? dataUrl.slice(index + marker.length) : dataUrl;
}

const visionTextHandler: RpcHandler = async (payload) => {
  const files = parseVisionFiles(payload);
  const vision = await storage.getVision();
  const active = await resolveActive(); // ERR-11 khi chưa cấu hình provider
  const model = resolveVisionModel({ model: active.config.model, vision: vision });
  if (model === null) {
    // KHÔNG có model VL (user rule bước 3) — báo từng file để AI ghi chú "không đọc được".
    return { results: files.map((f) => ({ name: f.name, error: "no-vision-model" })) };
  }
  await ensureHostPermission(active.config); // BR-05
  const vlConfig = { ...active.config, model: model }; // gọi model VL, cùng provider/key
  const results: { name: string; text?: string }[] = [];
  for (const file of files) {
    try {
      const pageTexts: string[] = [];
      for (let page = 0; page < file.pages.length; page += 1) {
        const response = await active.adapter.chat(vlConfig, buildVisionOcrMessages(page, file.pages.length), {
          temperature: 0,
          maxTokens: 2_000,
          visionImage: { base64: base64FromDataUrl(file.pages[page] as string), mediaType: "image/jpeg" }
        });
        pageTexts.push(response.text.trim());
      }
      const text = pageTexts.join("\n").slice(0, 20_000); // cap như extract thường
      const note = file.pages.length >= MAX_VISION_PAGES ? "\n[tài liệu dài — chỉ đọc 4 trang đầu]" : "";
      results.push({ name: file.name, text: text + note });
    } catch (error) {
      console.warn("[AIMH][attachment] vision OCR fail:", file.name.slice(0, 60), String(error).slice(0, 120));
      results.push({ name: file.name, error: "vision-failed" });
    }
  }
  return { results: results };
};

export function registerAttachmentHandlers(router: MessageRouter): void {
  registerCaptureListener();
  router.register("ATTACHMENT_CAPTURE_START", startHandler);
  router.register("ATTACHMENT_CAPTURE_COLLECT", collectHandler);
  router.register("ATTACHMENT_EXTRACT", extractHandler);
  router.register("ATTACHMENT_READ_PREVIEW", readPreviewHandler);
  router.register("ATTACHMENT_VISION_TEXT", visionTextHandler);
}
