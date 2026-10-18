// src/content/owa-adapter/attachment-reader.ts — orchestration đọc attachment cho AI (Plan A).
// Mỗi file: click "Open" (synthetic click — React phản ứng; preview KHÔNG đổi trạng thái mail)
// → OWA tự fetch binary → SW capture qua debugger Network → đóng preview → file kế.
// Sau đó: COLLECT bytes + EXTRACT text (SW: pdf.js/zip). Caps: 3 file/email; lỗi 1 file → bỏ qua,
// KHÔNG bao giờ chặn phân tích email (tinh thần FR-GD5-06).
import { sendMessage } from "../../shared/messaging";

const MAX_ATTACHMENTS = 3;
const PREVIEW_LOAD_MS = 3000; // chờ OWA fetch binary sau khi mở preview
// doc/xls (Word/Excel CŨ) nằm trong danh sách: AI ít nhất được báo CÓ file — nếu bytes
// không trích được (OLE binary, Office Online render) → placeholder thay text (xử lý dưới).
const SUPPORTED_EXT = ["txt", "csv", "md", "log", "doc", "xls", "docx", "xlsx", "pdf"];

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
  for (const option of options) {
    try {
      clickCenter(option.element);
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_LOAD_MS));
      await closePreview();
    } catch (error) {
      console.warn("[AIMH][attachment] mở/đóng preview lỗi:", option.name.slice(0, 60), String(error).slice(0, 120));
    }
  }
  const collected = await sendMessage<{ files: { url: string; base64: string }[] }>("ATTACHMENT_CAPTURE_COLLECT", {});
  const payload = options.map((option, index) => ({
    name: option.name,
    base64: collected.files[index]?.base64 ?? collected.files.find((f) => f.url.toLowerCase().includes(option.name.split(".").pop() ?? ""))?.base64 ?? ""
  })).filter((item) => item.base64.length > 0);
  if (payload.length === 0) return [];
  const extracted = await sendMessage<{ results: { name: string; text?: string }[] }>("ATTACHMENT_EXTRACT", { files: payload });
  // Lỗi extract KHÔNG bỏ im — placeholder để AI biết CÓ file (kể cả khi không đọc được nội dung).
  return extracted.results.map((r) => ({
    name: r.name,
    text: typeof r.text === "string" && r.text.length > 0
      ? r.text
      : "(Không trích được nội dung — định dạng Word/Excel cũ (.doc/.xls) được render qua Office Online, hoặc file nhị phân. Hãy ghi rõ trong phân tích rằng người dùng cần mở file đính kèm để xem nội dung.)"
  }));
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
