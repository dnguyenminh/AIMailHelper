// src/background/handlers/attachment.handler.ts — UAT 18/10 Plan A (đọc attachment cho AI).
// ATTACHMENT_CAPTURE_START/COLLECT: bật/ngắt "nghe" bytes OWA tự tải khi mở preview.
// ATTACHMENT_EXTRACT: binary (base64) → text (txt/csv/docx/xlsx/pdf) — chạy trong SW vì
// pdf.js fake-worker hoạt động ở đây. Tab LUÔN từ sender.tab — không nhận tabId từ payload.
import { AppError } from "../../shared/errors";
import { extractAttachmentText } from "../../shared/attachments/extract";
import { collectCapture, registerCaptureListener, startCapture } from "../attachment-capture";
import { readPreviewText } from "../preview-reader";
import type { MessageRouter, RpcHandler } from "../router";

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

export function registerAttachmentHandlers(router: MessageRouter): void {
  registerCaptureListener();
  router.register("ATTACHMENT_CAPTURE_START", startHandler);
  router.register("ATTACHMENT_CAPTURE_COLLECT", collectHandler);
  router.register("ATTACHMENT_EXTRACT", extractHandler);
  router.register("ATTACHMENT_READ_PREVIEW", readPreviewHandler);
}
