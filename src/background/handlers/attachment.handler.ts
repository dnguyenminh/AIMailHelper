import { AppError } from "../../shared/errors";
import { extractAttachmentText } from "../../shared/attachments/extract";
import { collectCapture, registerCaptureListener, startCapture } from "../attachment-capture";
import { readPreviewText, readPreviewImages } from "../preview-reader";
import { probePreviewIframes } from "../preview-probe";
import { resolveActive } from "../llm-runtime";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { storage } from "../../shared/storage";
import { buildVisionOcrMessages, buildVisionChunkSummaryMessages, buildVisionSynthesisMessages } from "../../shared/llm/prompts-vision";
import { resolveVisionModel } from "../../shared/llm/vision-model";
import type { MessageRouter, RpcHandler } from "../router";
const MAX_VISION_FILES = 3;
const MAX_VISION_PAGES = 4; const MAX_PAGE_B64 = 2_600_000; const MAX_EXTRACT_FILES = 5;
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
const readPreviewHandler: RpcHandler = async (_payload, sender) => {
  const { tabId, url } = senderTab(sender);
  return { text: await readPreviewText(tabId, url) };
};
// UAT 20/10 — extract data URL ảnh trang từ iframe preview (thay screenshot — full-res, không cần focus).
const readPreviewImagesHandler: RpcHandler = async (_payload, sender) => {
  const { tabId, url } = senderTab(sender);
  return { images: await readPreviewImages(tabId, url) };
};
// UC-09 mở rộng — probe cấu trúc iframe/img qua CDP cho DIAGNOSE (src redact — M-2).
const previewProbeHandler: RpcHandler = async (_payload, sender) => {
  const { tabId, url } = senderTab(sender); // attach trang cha trước — bắt buộc để quét OOPIF
  return { targets: await probePreviewIframes(tabId, url) };
};
interface VisionPageFile {
  name: string;
  pages: string[]; }
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
  const active = await resolveActive();   const model = resolveVisionModel({ model: active.config.model, vision: vision });
  if (model === null) {
    return { results: files.map((f) => ({ name: f.name, error: "no-vision-model" })) };
  }
  await ensureHostPermission(active.config);   const vlConfig = { ...active.config, model: model };   const CHUNK_PAGES = 10;
  const CHUNK_OVERLAP = 1;
  const MAX_CHUNKS = 4;
  const results: { name: string; text?: string; error?: string }[] = [];
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
            const chunks: string[][] = [];
      for (let start = 0; start < pageTexts.length; ) {
        const end = Math.min(start + CHUNK_PAGES, pageTexts.length);
        chunks.push(pageTexts.slice(start, end));
        if (end === pageTexts.length) break;
        start = end - CHUNK_OVERLAP;
      }
      if (chunks.length > MAX_CHUNKS) chunks.splice(MAX_CHUNKS);
            const chunkSummaries: { summary: string; keyPoints: string[] }[] = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk) continue;
        const summaryResponse = await active.adapter.chat(vlConfig, buildVisionChunkSummaryMessages(i, chunks.length), {
          temperature: 0,
          maxTokens: 2_000,
          visionImage: undefined,         });
                let summary: string, keyPoints: string[];
        try {
          const parsed = JSON.parse(summaryResponse.text.trim());
          summary = parsed.summary ?? "";
          keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [];
        } catch {
          summary = summaryResponse.text.trim().slice(0, 1000);
          keyPoints = [];
        }
        chunkSummaries.push({ summary, keyPoints });
      }
            const synthesisPrompt = buildVisionSynthesisMessages(chunks.length);
      const synthesisResponse = await active.adapter.chat(vlConfig, synthesisPrompt, {
        temperature: 0,
        maxTokens: 3_000,
        visionImage: undefined,
      });
      let synthesis: any = { overview: "", details: "", conclusions: "", actionItems: [] };
      try {
        synthesis = JSON.parse(synthesisResponse.text.trim());
      } catch {
        synthesis = { overview: synthesisResponse.text.trim().slice(0, 2000) };
      }
      const finalText = [
        synthesis.overview,
        synthesis.details,
        synthesis.conclusions,
        synthesis.actionItems?.join("\n")
      ].filter(Boolean).join("\n\n").slice(0, 30_000);
      const note = file.pages.length > 10 ? "\n[tài liệu dài — chunked vision-read: " + chunks.length + " chunks]" : "";
      results.push({ name: file.name, text: finalText + note });
    } catch (error) {
      console.warn("[AIMH][attachment] chunked vision-read lỗi:", file.name.slice(0, 60), String(error).slice(0, 120));
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
  router.register("ATTACHMENT_READ_PREVIEW_IMAGES", readPreviewImagesHandler);
  router.register("PREVIEW_IFRAME_PROBE", previewProbeHandler);
  router.register("ATTACHMENT_VISION_TEXT", visionTextHandler);
}
