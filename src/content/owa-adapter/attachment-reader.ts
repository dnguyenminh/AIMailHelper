// src/content/owa-adapter/attachment-reader.ts — orchestration đọc attachment cho AI (Plan A).
// Mỗi file: click "Open" (synthetic click — React phản ứng; preview KHÔNG đổi trạng thái mail)
// → OWA tự fetch binary → SW capture qua debugger Network → đóng preview → file kế.
// Sau đó: COLLECT bytes + EXTRACT text (SW: pdf.js/zip). Caps: 3 file/email; lỗi 1 file → bỏ qua,
// KHÔNG bao giờ chặn phân tích email (tinh thần FR-GD5-06).
import { sendMessage } from "../../shared/messaging";
import { AppError } from "../../shared/errors";

const MAX_ATTACHMENTS = 3;
const PREVIEW_RENDER_MS = 8000; // chờ Word/Excel Online render text trong iframe (app nặng)
// doc/xls (Word/Excel CŨ) nằm trong danh sách: AI ít nhất được báo CÓ file — nếu bytes
// không trích được (OLE binary, Office Online render) → placeholder thay text (xử lý dưới).
const SUPPORTED_EXT = ["txt", "csv", "md", "log", "doc", "xls", "docx", "xlsx", "pdf"];
const MIN_RENDERED_CHARS = 200; // text render ít hơn → coi là chưa render đủ → fallback
// Preview các loại này render ẢNH TRANG (verify 18/10: DOM/AX không có text) → Vision-read.
const IMAGE_RENDERED_EXT = ["doc", "xls", "docx", "xlsx"];

// Chunked vision-read cho tài liệu dài (UAT 18/10): đọc chunk → tóm tắt → lưu → tổng hợp
import { readFullDocumentVision } from "./vision-chunk-reader";

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
  // Text render đủ → dùng text render (txt/csv/pdf).
  // Text render thiếu + file render ẢNH (Word/Excel — verify: DOM/AX không có text) → Vision-read chunked.
  const rendered: string[] = [];
  const visionTexts = new Map<string, string>();
  for (const option of options) {
    try {
      clickCenter(option.element);
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_RENDER_MS));
      const preview = await sendMessage<{ text: string }>("ATTACHMENT_READ_PREVIEW", {});
      const ext = option.name.split(".").pop()?.toLowerCase() ?? "";
      if (preview.text.trim().length < MIN_RENDERED_CHARS && IMAGE_RENDERED_EXT.includes(ext)) {
        // File render ẢNH (Word/Excel) → Vision-read chunked — lỗi vision KHÔNG chặn file/email khác
        try {
          const result = await readFullDocumentVision(option.name, (phase, current, total) => {
            console.log(`[AIMH][attachment] ${phase}: ${current}/${total} - ${option.name}`);
          });
          const visionText = result.synthesis?.overview + "\n" + result.synthesis?.details + "\n" + result.synthesis?.conclusions;
          if (visionText && visionText.trim().length > 0) {
            visionTexts.set(option.name, visionText.trim());
          }
        } catch (error) {
          logVisionError(option.name, error);
        } finally {
          rendered.push(""); // text DOM là JS/CSS rác — không dùng làm attachment text
          await closePreview();
        }
      } else {
        // File render text (txt/csv/pdf) → dùng text render
        rendered.push(preview.text);
        await closePreview();
      }
    } catch (error) {
      console.warn("[AIMH][attachment] mở/đóng preview lỗi:", option.name.slice(0, 60), String(error).slice(0, 120));
      rendered.push("");
      try { await closePreview(); } catch {}
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

// Lỗi vision-read: ERR-15 từ VISION_CAPTURE phân biệt qua params.field
// (vision.handler gắn field="vision" khi BR-03 TẮT; field="captureVisibleTab" khi chụp fail).
function logVisionError(name: string, error: unknown): void {
  if (error instanceof AppError && error.code === "ERR-15") {
    if (error.params?.field === "vision") {
      console.warn(
        "[AIMH][attachment] vision-read BỎ QUA:", name.slice(0, 60),
        "— Vision đang TẮT. Mở Options → Vision (T3) → tick 'Bật vision' (toggle tự lưu) rồi thử lại."
      );
      return;
    }
    console.warn(
      "[AIMH][attachment] vision-read BỎ QUA:", name.slice(0, 60),
      "— chrome.tabs.captureVisibleTab lỗi (tab phải visible, không minimized). Xem log [AIMH][vision] ở Service Worker."
    );
    return;
  }
  console.warn("[AIMH][attachment] vision-read lỗi:", name.slice(0, 60), String(error).slice(0, 120));
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
