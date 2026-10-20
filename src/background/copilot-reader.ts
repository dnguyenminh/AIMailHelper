// src/background/copilot-reader.ts — GĐ-A (20/10): đọc text panel Copilot của OWA qua CDP.
// User quyết định: Copilot thay LLM+VL cho phân tích email. Panel chat là iframe cross-origin
// (cacheable-iframe:*copilotSidePanel*) → đường duy nhất khả thi: attach target type iframe
// hoặc other (Edge 155 — xem frame-discovery.isFrameCandidate) + DOMSnapshot (CHỈ ĐỌC — SR-12).
// 21/10 — thêm triggerCopilotChip: click chip "Summarize this email" TRONG panel bằng
// Input.dispatchMouseEvent (trusted) — click nút entry đôi khi chỉ mở panel không chạy summary
// (học UAT 20/10) → khi panel trống, chip click là đường submit đáng tin duy nhất.
import { getTargets, isFrameCandidate, sendSnapshot } from "./frame-discovery";
import { redactSrc } from "../shared/redact";

// URL pattern các panel chat/trợ lý: copilot + dcub (chat UI) + myday/mdc/optik/semanticoverview.
export const COPILOT_URL_PATTERN = /copilot|dcub|myday|mdc\/|optik|semanticoverview/i;

// Rank: copilot/dcub đứng trước các panel phụ.
export function copilotRank(url: string): number {
  return /copilot|dcub/i.test(url) ? 0 : 1;
}

export interface CopilotReadResult {
  text: string;
  parts: string[]; // text node RIÊNG theo thứ tự DOM — diff theo node (không phụ thuộc join/cap toàn cục)
  lines: string[]; // redact sẵn (M-2) — báo cáo in nguyên; KHÔNG chứa nội dung chat
}

// Kết quả click chip trong panel Copilot (reason để DIAGNOSE — không chứa nội dung chat).
export interface CopilotChipResult {
  clicked: boolean;
  reason: string;
}

const MAX_COPILOT_CHARS = 60_000;
const MAX_PARTS = 5000; // giữ ĐUÔI (node mới nằm cuối chat); đuôi cũ bị gọi là chấp nhận
const CHIP_TEXT_RE = /^(summarize( this email)?|tóm tắt( email này)?|tóm tắt email)$/i;

// Frame Copilot (dùng chung đọc + chip click): lọc candidate + rank + cap số lượng.
async function copilotTargets(limit: number): Promise<chrome.debugger.TargetInfo[]> {
  const targets = await getTargets();
  return targets
    .filter((t) => isFrameCandidate(t) && t.id !== undefined && COPILOT_URL_PATTERN.test(t.url ?? ""))
    .sort((a, b) => copilotRank(a.url ?? "") - copilotRank(b.url ?? ""))
    .slice(0, limit);
}

// Trích text node (#text → nodeValue index strings) từ DOMSnapshot.
function partsFromSnapshot(snapshot: unknown): string[] {
  const snap = snapshot as { strings?: string[]; documents?: { nodes?: { nodeName?: number[]; nodeValue?: number[] } }[] } | undefined;
  const strings = snap?.strings ?? [];
  const parts: string[] = [];
  for (const doc of snap?.documents ?? []) {
    const nodeName = doc?.nodes?.nodeName ?? [];
    const nodeValue = doc?.nodes?.nodeValue ?? [];
    for (let i = 0; i < nodeName.length; i += 1) {
      if ((strings[nodeName[i] ?? -1] ?? "") !== "#text") continue;
      const valueIndex = nodeValue[i];
      if (valueIndex === undefined || valueIndex === -1) continue;
      const text = strings[valueIndex];
      if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
    }
  }
  return parts.length > MAX_PARTS ? parts.slice(parts.length - MAX_PARTS) : parts;
}

// Đọc text từ mọi frame Copilot đang mở. Không frame khớp → text "" (caller fallback).
export async function readCopilotPanelText(): Promise<CopilotReadResult> {
  const candidates = await copilotTargets(3);
  const lines = ["copilot frames: " + (candidates.length === 0 ? "(chưa mở panel)" :
    candidates.map((t) => (t.attached === true ? "A" : "-") + ":" + redactSrc(t.url ?? "")).join(" | "))];
  const allParts: string[] = [];
  for (const frame of candidates) {
    const targetId = frame.id; // TargetInfo.id — TS union không có targetId
    if (targetId === undefined) continue;
    let snapshot: unknown;
    try {
      try { await chrome.debugger.attach({ targetId: targetId }, "1.3"); } catch { /* đã attach — session của chính extension vẫn dùng được */ }
      snapshot = await sendSnapshot(targetId);
      try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
    } catch {
      continue; // frame hết hạn / client khác giữ attach (DevTools mở — nhớ đóng trước khi test)
    }
    const parts = partsFromSnapshot(snapshot);
    if (parts.length > 0) allParts.push(...parts);
  }
  const clipped = allParts.length > MAX_PARTS ? allParts.slice(allParts.length - MAX_PARTS) : allParts;
  const merged = clipped.join(" ").replace(/[ \t]+/g, " ").trim();
  const text = merged.length > MAX_COPILOT_CHARS ? merged.slice(merged.length - MAX_COPILOT_CHARS) : merged;
  if (text.length > 0) lines.push("textLen=" + String(text.length) + " parts=" + String(clipped.length));
  return { text: text, parts: clipped, lines: lines };
}

// ── 21/10 — click chip "Summarize this email" TRONG panel (Input trusted qua CDP) ──

// sendCommand có reject — phân biệt lỗi attach/client khác giữ (DevTools mở) vs kết quả rỗng.
function cdpCall(targetId: string, method: string, params: { [key: string]: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ targetId: targetId }, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err !== undefined) { void chrome.runtime.lastError; reject(new Error(String(err.message ?? ""))); return; }
      resolve(result);
    });
  });
}

interface ChipRect { x: number; y: number; w: number; h: number; text: string }

interface ChipSnapshot {
  strings: string[];
  nodeName: number[];
  nodeValue: number[];
  layoutIndex: number[]; // layout.nodeIndex — node DOM thứ k của layout
  bounds: number[]; // layout.bounds — 4 số CSS px/node (x,y,w,h) theo tài liệu frame
}

// Gộp mảng node + layout từ captureSnapshot (documents[0] + layout — thiếu 1 trong hai → null).
function chipArraysFromSnapshot(snapshot: unknown): ChipSnapshot | null {
  const snap = snapshot as {
    strings?: string[]; documents?: { nodes?: { nodeName?: number[]; nodeValue?: number[] } }[];
    layout?: { nodeIndex?: number[]; bounds?: number[] };
  } | undefined;
  const layout = snap?.layout;
  if (snap?.documents?.[0] === undefined || layout === undefined) return null;
  return {
    strings: snap.strings ?? [],
    nodeName: snap.documents[0]?.nodes?.nodeName ?? [],
    nodeValue: snap.documents[0]?.nodes?.nodeValue ?? [],
    layoutIndex: layout.nodeIndex ?? [],
    bounds: layout.bounds ?? []
  };
}

// Tìm chip: text node khớp CHIP_TEXT_RE + bounds theo layout.nodeIndex. LẤY match CUỐI
// (node mới nằm cuối DOM order) — panel đang stream thì không có chip → trả null.
function chipRectFromSnapshot(snapshot: unknown): ChipRect | null {
  const data = chipArraysFromSnapshot(snapshot);
  if (data === null) return null;
  let found: ChipRect | null = null;
  for (let k = 0; k < data.layoutIndex.length; k += 1) {
    const node = data.layoutIndex[k] ?? -1;
    if (node < 0 || (data.strings[data.nodeName[node] ?? -1] ?? "") !== "#text") continue;
    const value = data.strings[data.nodeValue[node] ?? -1] ?? "";
    if (!CHIP_TEXT_RE.test(value.trim())) continue;
    const x = data.bounds[4 * k], y = data.bounds[4 * k + 1], w = data.bounds[4 * k + 2], h = data.bounds[4 * k + 3];
    if (x === undefined || y === undefined || !w || w <= 0 || !h || h <= 0) continue;
    found = { text: value, x: x, y: y, w: w, h: h };
  }
  return found;
}

// Input.dispatchMouseEvent tải chuỗi press/release — click chuẩn tới toạ độ tâm chip.
async function mouseClickAt(targetId: string, x: number, y: number): Promise<void> {
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y });
  await cdpCall(targetId, "Input.dispatchMouseEvent",
    { type: "mousePressed", x: x, y: y, button: "left", buttons: 1, clickCount: 1 });
  await cdpCall(targetId, "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: x, y: y, button: "left", buttons: 0, clickCount: 1 });
}

// Panel mở nhưng trống → click chip. Detach luôn (kể cả lỗi) — không giữ client CDP.
export async function triggerCopilotChip(): Promise<CopilotChipResult> {
  const targetId = (await copilotTargets(1))[0]?.id;
  if (targetId === undefined) return { clicked: false, reason: "panel-chua-mo" };
  try {
    try { await chrome.debugger.attach({ targetId: targetId }, "1.3"); } catch { /* đã attach */ }
    const snapshot = await cdpCall(targetId, "DOMSnapshot.captureSnapshot", { computedStyles: [] });
    const chip = chipRectFromSnapshot(snapshot);
    if (chip === null) return { clicked: false, reason: "chip-khong-thay" };
    await mouseClickAt(targetId, chip.x + chip.w / 2, chip.y + chip.h / 2);
    try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
    return { clicked: true, reason: "clicked" };
  } catch (error) {
    try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
    return { clicked: false, reason: "cdp-" + String(error instanceof Error ? error.message : String(error)).slice(0, 60) };
  }
}
