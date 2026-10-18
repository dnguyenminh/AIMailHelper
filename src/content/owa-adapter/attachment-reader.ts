// src/content/owa-adapter/attachment-reader.ts — orchestration đọc attachment cho AI (Plan A).
// Mỗi file: click "Open" (synthetic click — React phản ứng; preview KHÔNG đổi trạng thái mail)
// → OWA tự fetch binary → SW capture qua debugger Network → đóng preview → file kế.
// Sau đó: COLLECT bytes + EXTRACT text (SW: pdf.js/zip). Caps: 3 file/email; lỗi 1 file → bỏ qua,
// KHÔNG bao giờ chặn phân tích email (tinh thần FR-GD5-06).
import { sendMessage } from "../../shared/messaging";

const MAX_ATTACHMENTS = 3;
const PREVIEW_RENDER_MS = 4500; // chờ Word/Excel Online render text trong iframe (app nặng)
// doc/xls (Word/Excel CŨ) nằm trong danh sách: AI ít nhất được báo CÓ file — nếu bytes
// không trích được (OLE binary, Office Online render) → placeholder thay text (xử lý dưới).
const SUPPORTED_EXT = ["txt", "csv", "md", "log", "doc", "xls", "docx", "xlsx", "pdf"];
const MIN_RENDERED_CHARS = 200; // text render ít hơn → coi là chưa render đủ → fallback
// Preview các loại này render ẢNH TRANG (verify 18/10: DOM/AX không có text) → Vision-read.
const IMAGE_RENDERED_EXT = ["doc", "xls", "docx", "xlsx"];
const VISION_PAGES = 4;
const VISION_SCROLL_DELTA = 1200;
const VISION_PAGE_WAIT_MS = 1800;

export interface AttachmentText {
  name: string;
  text: string;
}

interface AttachmentOption {
  element: HTMLElement;
  name: string;
}

// Strip attachment trong reading pane: [aria-label="file attachments"] — option = "name.ext Open …".
function findAttachmentOptions(): AttachmentOption[] {
  const strip = document.querySelector('[id="Skip to message-region"] [aria-label="file attachments"], [role="main"] [aria-label="file attachments"]');
  if (!strip) return [];
  const options: AttachmentOption[] = [];
  for (const option of Array.from(strip.querySelectorAll('[role="option"]'))) {
    const label = option.getAttribute("aria-label") ?? option.textContent ?? "";
    const name = label.replace(/\s*Open\s.*$/i, "").trim();
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (name.length > 0 && SUPPORTED_EXT.includes(ext)) {
      options.push({ element: option as HTMLElement, name: name });
    }
  }
  return options;
}

function clickCenter(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(new MouseEvent("click", {
    bubbles: true, cancelable: true,
    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
  }));
}

// Đóng preview: nút Close trong dialog (đã thấy trên trang thật: "Close" góc phải trên).
async function closePreview(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const close = Array.from(dialog.querySelectorAll("button")).find((b) => /^close$|^đóng$/i.test(b.getAttribute("aria-label") ?? ""));
    if (close) {
      (close as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }
}

// Vision fallback: preview đang MỞ (gọi giữa open—close) → chụp VISION_PAGES trang,
// cuộn xuống giữa các lần bằng trusted-scroll (DEBUGGER_SCROLL — RPC có sẵn) trên vùng dialog.
async function captureVisionPages(name: string): Promise<{ name: string; pages: string[] } | null> {
  const pages: string[] = [];
  try {
    for (let page = 0; page < VISION_PAGES; page += 1) {
      const shot = await sendMessage<{ dataUrl: string }>("VISION_CAPTURE", {});
      pages.push(shot.dataUrl);
      if (page === VISION_PAGES - 1) break;
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog === null) break; // preview đóng bất ngờ
      const rect = dialog.getBoundingClientRect();
      await sendMessage("DEBUGGER_SCROLL", {
        x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2),
        deltaY: VISION_SCROLL_DELTA, times: 2
      });
      await new Promise((resolve) => setTimeout(resolve, VISION_PAGE_WAIT_MS));
    }
  } catch (error) {
    console.warn("[AIMH][attachment] vision capture lỗi:", name.slice(0, 50), String(error).slice(0, 120));
  }
  return pages.length > 0 ? { name: name, pages: pages } : null;
}

export async function extractAttachmentsForEmail(): Promise<AttachmentText[]> {
  const options = findAttachmentOptions().slice(0, MAX_ATTACHMENTS);
  if (options.length === 0) return [];
  try {
    await sendMessage("ATTACHMENT_CAPTURE_START", {});
  } catch (error) {
    console.warn("[AIMH][attachment] bật capture lỗi — bỏ qua attachment:", String(error).slice(0, 120));
    return [];
  }
  // Vòng 1 — mở preview TỪNG file: đọc TEXT RENDER (Word/Excel Online iframe — UAT 18/10,
  // đúng cách user nhìn thấy) + capture bytes song song (PDF/txt fallback).
  // Text render thiếu + file render ẢNH (Word/Excel — verify: DOM/AX không có text) → Vision-read.
  const rendered: string[] = [];
  const visionJobs: { name: string; pages: string[] }[] = [];
  for (const option of options) {
    try {
      clickCenter(option.element);
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_RENDER_MS));
      const preview = await sendMessage<{ text: string }>("ATTACHMENT_READ_PREVIEW", {});
      const ext = option.name.split(".").pop()?.toLowerCase() ?? "";
      if (preview.text.trim().length < MIN_RENDERED_CHARS && IMAGE_RENDERED_EXT.includes(ext)) {
        const job = await captureVisionPages(option.name);
        if (job !== null) visionJobs.push(job);
        rendered.push(""); // text DOM là JS/CSS rác — không dùng làm attachment text
      } else {
        rendered.push(preview.text);
      }
      await closePreview();
    } catch (error) {
      console.warn("[AIMH][attachment] mở/đóng preview lỗi:", option.name.slice(0, 60), String(error).slice(0, 120));
      rendered.push("");
    }
  }
  // Vòng 2 — bytes đã capture: extract (PDF canvas không có text DOM → cần pdf.js từ bytes).
  const collected = await sendMessage<{ files: { url: string; base64: string }[] }>("ATTACHMENT_CAPTURE_COLLECT", {});
  const payload = options.map((option, index) => ({
    name: option.name,
    base64: collected.files[index]?.base64 ?? collected.files.find((f) => f.url.toLowerCase().includes(option.name.split(".").pop() ?? ""))?.base64 ?? ""
  })).filter((item) => item.base64.length > 0);
  let extracted = new Map<string, string>();
  if (payload.length > 0) {
    const response = await sendMessage<{ results: { name: string; text?: string }[] }>("ATTACHMENT_EXTRACT", { files: payload });
    extracted = new Map(response.results.filter((r) => typeof r.text === "string").map((r) => [r.name, r.text as string]));
  }
  // Vòng 3 — Vision OCR cho file render ảnh (model theo rule user: VL riêng → model text
  // nếu hỗ trợ VL → KHÔNG model VL nào → bỏ qua + ghi chú).
  let visionTexts = new Map<string, string>();
  if (visionJobs.length > 0) {
    try {
      const visionResponse = await sendMessage<{ results: { name: string; text?: string; error?: string }[] }>("ATTACHMENT_VISION_TEXT", { files: visionJobs });
      visionTexts = new Map(visionResponse.results.filter((r) => typeof r.text === "string").map((r) => [r.name, r.text as string]));
      if (visionResponse.results.some((r) => r.error === "no-vision-model")) {
        console.warn("[AIMH][attachment] KHÔNG có model VL — cấu hình model VL trong Cài đặt (hoặc model chính phải hỗ trợ VL vd gpt-4o)");
      }
    } catch (error) {
      console.warn("[AIMH][attachment] vision OCR lỗi:", String(error).slice(0, 120));
    }
  }
  // Ghép: text RENDER → Vision OCR → bytes extract → placeholder.
  return options.map((option, index) => ({
    name: option.name,
    text: pickAttachmentText(option.name, rendered[index] ?? "", extracted, visionTexts)
  }));
}

function pickAttachmentText(name: string, rendered: string, extracted: Map<string, string>, visionTexts: Map<string, string>): string {
  if (rendered.trim().length >= MIN_RENDERED_CHARS) return rendered;
  const fromVision = visionTexts.get(name);
  if (fromVision !== undefined && fromVision.trim().length > 0) return fromVision;
  const fromBytes = extracted.get(name);
  if (fromBytes !== undefined && fromBytes.length > 0) return fromBytes;
  return "(Không trích được nội dung — file nhị phân hoặc preview chưa render xong. Hãy ghi rõ trong phân tích rằng người dùng cần mở file đính kèm để xem nội dung.)";
}

// Hook cho reader.readEmail — email CÓ đính kèm mới đọc (tiết kiệm); LỖI không bao giờ chặn
// phân tích email (phân tích vẫn chạy với bodyText — tinh thần FR-GD5-06).
export async function withAttachmentTexts<T extends { hasAttachment: boolean }>(email: T): Promise<T & { attachments?: { name: string; text: string }[] }> {
  if (!email.hasAttachment) return email;
  try {
    const attachments = await extractAttachmentsForEmail();
    return attachments.length > 0 ? { ...email, attachments: attachments } : email;
  } catch (error) {
    console.warn("[AIMH][attachment] đọc attachment lỗi — phân tích không attachment:", String(error).slice(0, 120));
    return email;
  }
}
