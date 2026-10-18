// src/background/preview-reader.ts — đọc text ĐƯỢC RENDER trong preview attachment (UAT 18/10).
// Word/Excel Online render nội dung dạng DOM TEXT trong iframe cross-origin (officeapps) —
// content script không đọc trực tiếp được, NHƯNG chrome.debugger attach được vào iframe
// target (OOPIF) và dùng CDP DOMSnapshot.captureSnapshot (CHỈ ĐỌC — không Runtime.evaluate).
// Ưu điểm: đọc được MỌI định dạng OWA render (doc/docx/xls/xlsx…) — không cần format parser.
import { ensureAttachedShared } from "./debugger-scroll";

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

function getTargets(): Promise<chrome.debugger.TargetInfo[]> {
  return new Promise((resolve) => chrome.debugger.getTargets((targets) => resolve(targets ?? [])));
}

function sendSnapshot(targetId: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ targetId: targetId }, "DOMSnapshot.captureSnapshot", { computedStyles: [] }, (result) => {
      void chrome.runtime.lastError; // iframe hết hạn/đóng — resolve undefined
      resolve(result);
    });
  });
}

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
