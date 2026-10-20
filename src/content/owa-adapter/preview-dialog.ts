// src/content/owa-adapter/preview-dialog.ts — LỚP 1 đọc ảnh trang Word (UAT 20/10).
// Người dùng chỉ cấu trúc thật: dialog preview = Fluent UI DialogSurface NGAY trong DOM chính
// OWA (body > div > div.fui-DialogSurface…), bên trong có iframe + (có thể) <img> trang.
// Content script đọc trực tiếp DOM dialog (grid imgs nếu render ở shell) → convert blob:/http
// → data URL ngay tại trang (fetch của page có cookie OWA) — KHÔNG cần CDP/screenshot.
import { redactSrc } from "../../shared/redact";

// Tìm dialog preview: ưu tiên Fluent DialogSurface (lớp mới nhất nếu nhiều dialog chồng);
// fallback [role="dialog"] cuối (Fluent cắt aria role lên surface).
export function findPreviewDialog(): Element | null {
  const surfaces = document.querySelectorAll('div[class*="fui-DialogSurface"]');
  if (surfaces.length > 0) return surfaces[surfaces.length - 1] ?? null;
  const dialogs = document.querySelectorAll('[role="dialog"]');
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] ?? null : null;
}

export function listPreviewIframes(dialog: Element): HTMLIFrameElement[] {
  return Array.from(dialog.querySelectorAll("iframe"));
}

// src tương đối → tuyệt đối theo trang; data:/blob:/http giữ nguyên.
function resolveSrc(src: string): string {
  if (/^(data:|blob:|https?:)/i.test(src)) return src;
  try { return new URL(src, document.baseURI).toString(); } catch { return src; }
}

export interface DialogConversionDeps {
  fetchImpl: typeof fetch; // fetch page context (cookie OWA, blob cùng document)
  FileReaderCtor: new () => FileReader;
}

// blob:/http → data URL bằng FileReader (đọc blob — nội dung gốc full-res).
function blobToDataUrl(blob: Blob, deps: DialogConversionDeps): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new deps.FileReaderCtor();
    reader.onload = () => resolve(typeof reader.result === "string" && reader.result.startsWith("data:image/") ? reader.result : null);
    reader.onerror = () => resolve(null); // đọc không thành — caller bỏ qua ảnh này
    reader.readAsDataURL(blob);
  });
}

async function toDataUrl(src: string, deps: DialogConversionDeps): Promise<string | null> {
  if (src.startsWith("data:image/")) return src.length <= 2_600_000 ? src : null;
  if (src.startsWith("blob:") || /^https?:/i.test(src)) {
    try {
      const response = await deps.fetchImpl(src, { credentials: "include" });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (blob.size === 0) return null;
      return await blobToDataUrl(blob, deps);
    } catch { return null; } // blob cross-document/origin chặn — caller đi lớp CDP
  }
  return null;
}

// Thu gom id-thứ-tự: số trong id (#i1/#i2…) — không id → hết danh sách (giữ cuối).
function idOrder(id: string): number {
  const match = id.match(/(\d+)/);
  return match === null ? Number.MAX_SAFE_INTEGER : parseInt(match[1] ?? "0", 10);
}

const MAX_DIALOG_IMAGES = 12;

// Đọc ảnh trang trong dialog shell (main DOM): sort theo id, convert → data URLs.
export async function collectDialogImages(deps: DialogConversionDeps): Promise<string[]> {
  const dialog = findPreviewDialog();
  if (dialog === null) return [];
  const candidates = new Map<string, { id: string; src: string }>(); // resolved src → spec
  for (const img of dialog.querySelectorAll("img")) {
    const raw = (img.getAttribute("src") ?? img.getAttribute("data-src") ?? "").trim();
    if (raw.length === 0) continue;
    const resolved = resolveSrc(raw);
    if (candidates.has(resolved)) continue;
    candidates.set(resolved, { id: img.getAttribute("id") ?? "", src: resolved });
  }
  const specs = Array.from(candidates.values()).sort((a, b) => idOrder(a.id) - idOrder(b.id));
  const dataUrls: string[] = [];
  for (const spec of specs.slice(0, MAX_DIALOG_IMAGES)) {
    const dataUrl = await toDataUrl(spec.src, deps);
    if (dataUrl !== null) dataUrls.push(dataUrl);
  }
  return dataUrls;
}

// Diagnostics cho UC-09 — mọi src REDACT (M-2), không nội dung email.
export function describePreviewDialogLines(): string[] {
  const dialog = findPreviewDialog();
  if (dialog === null) return ["dialog surface: KHÔNG THẤY (dialog đóng hoặc chưa mở)"];
  const lines: string[] = [];
  const className = (dialog as HTMLElement).className ?? "";
  lines.push("dialog surface: THẤY (class=" + (className.length > 36 ? className.slice(0, 36) + "…" : className) + ")");
  listPreviewIframes(dialog).slice(0, 4).forEach((frame, index) => {
    lines.push("iframe#" + String(index) + " src=" + redactSrc(frame.getAttribute("src") ?? ""));
  });
  const images = dialog.querySelectorAll("img");
  lines.push("img trực tiếp trong dialog=" + String(images.length));
  Array.from(images).slice(0, 8).forEach((img, index) => {
    const src = img.getAttribute("src") ?? img.getAttribute("data-src") ?? "";
    lines.push("img#" + String(index) + " id=" + String(img.getAttribute("id") ?? "") + " src=" + redactSrc(src));
  });
  return lines;
}
