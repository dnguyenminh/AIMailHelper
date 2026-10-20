// src/background/preview-reader.ts — đọc text ĐƯỢC RENDER trong preview attachment (UAT 18/10).
// Word/Excel Online render nội dung dạng DOM TEXT trong iframe cross-origin (officeapps) —
// content script không đọc trực tiếp được, NHƯNG chrome.debugger attach được vào iframe
// target (OOPIF) và dùng CDP DOMSnapshot.captureSnapshot (CHỈ ĐỌC — không Runtime.evaluate).
// Ưu điểm: đọc được MỌI định dạng OWA render (doc/docx/xls/xlsx…) — không cần format parser.
import { ensureAttachedShared } from "./debugger-scroll";
import { discoverFrames, getTargets, sendSnapshot } from "./frame-discovery";

const PREVIEW_FRAME_PATTERN = /officeapps\.live\.com|office\.com\/(wv|xv|pv|we)|word-view|excel-view|powerpoint-view|attachments\.office\.net/i;
const MAX_PREVIEW_CHARS = 20_000;

interface SnapshotNodes {
  nodeName?: number[];
  nodeValue?: number[];
}

interface SnapshotDoc {
  nodes?: SnapshotNodes;
}

// Trích text từ DOMSnapshot: text node = nodeName "#text", nội dung trong nodeValue (index
// vào strings). Gộp + chuẩn hóa khoảng trắng. Hàm thuần — test được không cần CDP.
export function textFromSnapshot(snapshot: unknown): string {
  const snap = snapshot as { strings?: string[]; documents?: SnapshotDoc[] } | undefined;
  const strings = snap?.strings ?? [];
  const documents: SnapshotDoc[] = snap?.documents ?? [];
  const parts: string[] = [];
  for (const doc of documents) {
    const nodeName = doc?.nodes?.nodeName ?? [];
    const nodeValue = doc?.nodes?.nodeValue ?? [];
    for (let i = 0; i < nodeName.length; i += 1) {
      const name = strings[nodeName[i] ?? -1] ?? "";
      if (name !== "#text") continue;
      const valueIndex = nodeValue[i];
      if (valueIndex === undefined || valueIndex === -1) continue;
      const text = strings[valueIndex];
      if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
    }
  }
  return parts.join(" ").replace(/[ \t]+/g, " ").trim();
}

// ── Chuyển getTargets/sendSnapshot sang frame-discovery (dùng chung với probe UC-09). ──

// Đọc text từ TẤT CẢ iframe preview của tab (Word/Excel Online…). Gọi SAU khi preview mở.
export async function readPreviewText(tabId: number, tabUrl: string | undefined): Promise<string> {
  await ensureAttachedShared(tabId, tabUrl); // session chung với trusted-scroll (1 infobar)
  const targets = await getTargets();
  // @types/chrome chưa có "iframe" trong union — Chrome thật trả về "iframe" cho OOPIF.
  const frames = targets.filter((t) =>
    (t.type as string) === "iframe" && t.url !== undefined && PREVIEW_FRAME_PATTERN.test(t.url) && t.attached === false);
  const texts: string[] = [];
  for (const frame of frames.slice(0, 4)) {
    try {
      await chrome.debugger.attach({ targetId: frame.id }, "1.3");
      const snapshot = await sendSnapshot(frame.id);
      const text = textFromSnapshot(snapshot);
      if (text.length > 0) texts.push(text);
    } catch {
      /* iframe hết hạn/detach — bỏ qua frame này */
    }
  }
  const merged = texts.join("\n");
  return merged.length > MAX_PREVIEW_CHARS ? merged.slice(0, MAX_PREVIEW_CHARS) + "…[cắt]" : merged;
}

// ── UAT 20/10: preview Word render từng TRANG là <img id="i1…"> trong iframe — extract src trực tiếp
// (ảnh gốc full-res → OCR nét hơn screenshot; KHÔNG cần tab visible/focus). Chụp màn hình chỉ fallback.

interface SnapshotNodesFull {
  nodeName?: number[];
  attributes?: number[][]; // mỗi node 1 mảng phẳng [nameIdx, valueIdx, …]
}

export interface PreviewImage {
  id: string;
  src: string;
}

// Hàm thuần — trích src của mọi <img> từ DOMSnapshot (test được không cần CDP).
// Ưu tiên src → data-src (lazy) → url(…) trong style; sort theo số trong id "#i1/#i2…" (thứ tự trang).
export function imagesFromSnapshot(snapshot: unknown): PreviewImage[] {
  const snap = snapshot as { strings?: string[]; documents?: { nodes?: SnapshotNodesFull }[] } | undefined;
  const strings = snap?.strings ?? [];
  const found: PreviewImage[] = [];
  for (const doc of snap?.documents ?? []) {
    const nodeName = doc?.nodes?.nodeName ?? [];
    const attributes = doc?.nodes?.attributes ?? [];
    for (let i = 0; i < nodeName.length; i += 1) {
      if ((strings[nodeName[i] ?? -1] ?? "") !== "IMG") continue;
      const pairs = attributes[i] ?? [];
      let src = "";
      let fallback = "";
      let id = "";
      for (let p = 0; p + 1 < pairs.length; p += 2) {
        const name = strings[pairs[p] ?? -1];
        const value = strings[pairs[p + 1] ?? -1] ?? "";
        if (name === "src" && value.length > 0) src = value;
        else if (name === "data-src" && value.length > 0) fallback = value;
        else if (name === "id") id = value;
        else if (name === "style" && fallback.length === 0) {
          const match = value.match(/url\((['"]?)([^'")]+)\1\)/i);
          if (match?.[2]) fallback = match[2];
        }
      }
      const finalSrc = src.length > 0 ? src : fallback;
      if (finalSrc.length > 0) found.push({ id: id, src: finalSrc });
    }
  }
  const idOrder = (id: string): number => {
    const match = id.match(/(\d+)/);
    return match === null ? Number.MAX_SAFE_INTEGER : parseInt(match[1] ?? "0", 10);
  };
  return found.sort((a, b) => idOrder(a.id) - idOrder(b.id));
}

// src tương đối trong iframe → tuyệt đối theo URL frame; data:/http giữ nguyên.
function resolveSrc(src: string, frameUrl: string | undefined): string {
  if (src.startsWith("data:") || /^https?:/i.test(src)) return src;
  try {
    return new URL(src, frameUrl).toString();
  } catch {
    return src;
  }
}

// fetch ảnh http(s) (cookie OWA — host_permissions có domain OWA) → data URL. blob: không fetch được từ SW.
async function srcToDataUrl(src: string, maxChars: number): Promise<string | null> {
  if (src.startsWith("data:image/")) return src.length <= maxChars ? src : null;
  if (!/^https?:/i.test(src)) return null;
  try {
    const response = await fetch(src, { credentials: "include" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0 || blob.size * 4 / 3 > maxChars) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return "data:" + (blob.type || "image/jpeg") + ";base64," + btoa(binary);
  } catch {
    return null; // origin ngoài host permission — caller fallback sang screenshot
  }
}

const MAX_PREVIEW_IMAGES = 10;

// Lấy data URL của TẤT CẢ ảnh trang trong iframe preview của tab.
// LỌI MỌI iframe (OOPIF): frame preview có thể src=about:blank (Office ghi nội dung động) —
// KHÔNG lọc theo PREVIEW_FRAME_PATTERN; attach lỗi (đã attach bởi chính extension) vẫn dùng session.
export async function readPreviewImages(tabId: number, tabUrl: string | undefined): Promise<string[]> {
  // Dùng discovery chung: attach trang cha + auto-attach + frame tree (bài học 20/10 — 0 frame
  // khi không attach trước; frame preview có thể about:blank nên KHÔNG lọc theo pattern).
  const discovery = await discoverFrames(tabId, tabUrl);
  const built: PreviewImage[] = [];
  const seenSrc = new Set<string>();
  for (const frame of discovery.frames.filter((f) => f.targetId !== undefined).slice(0, 6)) {
    const targetId = frame.targetId;
    if (targetId === undefined) continue;
    let snapshot: unknown;
    try {
      try { await chrome.debugger.attach({ targetId: targetId }, "1.3"); } catch { /* đã attach — session của chính extension vẫn dùng được */ }
      snapshot = await sendSnapshot(targetId);
      try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
    } catch {
      continue; // frame hết hạn/session của extension khác — bỏ qua
    }
    for (const item of imagesFromSnapshot(snapshot)) {
      const resolved = resolveSrc(item.src, frame.url);
      if (seenSrc.has(resolved)) continue;
      seenSrc.add(resolved);
      built.push({ id: item.id, src: resolved });
    }
  }
  const idOrder = (id: string): number => {
    const match = id.match(/(\d+)/);
    return match === null ? Number.MAX_SAFE_INTEGER : parseInt(match[1] ?? "0", 10);
  };
  const dataUrls: string[] = [];
  for (const item of built.sort((a, b) => idOrder(a.id) - idOrder(b.id))) {
    const dataUrl = await srcToDataUrl(item.src, 2_500_000);
    if (dataUrl !== null) dataUrls.push(dataUrl);
    if (dataUrls.length >= MAX_PREVIEW_IMAGES) break;
  }
  return dataUrls;
}
