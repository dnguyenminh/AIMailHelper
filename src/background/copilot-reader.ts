// src/background/copilot-reader.ts — GĐ-A (20/10): đọc text panel Copilot của OWA qua CDP.
// User quyết định: Copilot thay LLM+VL cho phân tích email. Panel chat là iframe cross-origin
// (cacheable-iframe:*copilotSidePanel*) → đường duy nhất khả thi: attach target type iframe
// hoặc other (Edge 155 — xem frame-discovery.isFrameCandidate) + DOMSnapshot (CHỈ ĐỌC — SR-12).
// 21/10 — đọc chatbox thật (UAT): RAW snapshot 186k chars mà 99% là #text của <script>/<style>
// → lọc bằng parentIndex; sidebar Copilot riêng của Edge (copilot.microsoft.com) attach bị
// DENIED ("Cannot access chrome:// and edge:// URLs") → loại khỏi candidate; rank ưu tiên
// semanticoverview (panel OWA duy nhất đọc được).
import { getTargets, isFrameCandidate, sendSnapshot } from "./frame-discovery";
import { boundsAt } from "../shared/copilot-format";
import type { RawDoc } from "../shared/copilot-format";
import { redactSrc } from "../shared/redact";

// URL pattern các panel chat/trợ lý: copilot + dcub (chat UI) + myday/mdc/optik/semanticoverview.
export const COPILOT_URL_PATTERN = /copilot|dcub|myday|mdc\/|optik|semanticoverview/i;

// Sidebar Copilot RIÊNG của Edge (browser UI, type=other) — chrome.debugger bị chặn tuyệt đối.
// (?:/|\.) copilot.microsoft.com — bắt cả https://copilot… và sub-domain.
export const COPILOT_EXCLUDE_RE = /(?:\/|\.)copilot\.microsoft\.com/i;

// Rank: semanticoverview (panel OWA duy nhất đọc được) trước, khác sau.
export function copilotRank(url: string): number {
  return /semanticoverview|copilotSidePanel|dcub/i.test(url) ? 0 : 1;
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

// Frame Copilot (dùng chung đọc + chip click + AX structure): lọc candidate (LOẠI sidebar Edge) + rank + cap.
export async function copilotTargets(limit: number): Promise<chrome.debugger.TargetInfo[]> {
  const targets = await getTargets();
  return targets
    .filter((t) => isFrameCandidate(t) && t.id !== undefined
      && COPILOT_URL_PATTERN.test(t.url ?? "") && !COPILOT_EXCLUDE_RE.test(t.url ?? ""))
    .sort((a, b) => copilotRank(a.url ?? "") - copilotRank(b.url ?? ""))
    .slice(0, limit);
}

// Text node của <script>/<style> chiếm ~99% snapshot (UAT 21/10: 186k tổng / 2.2k sạch) —
// loại bằng parentIndex: đi ngược ancestor tối đa 10 mức, gặp SCRIPT/STYLE → junk.
function junkAncestor(strings: string[], nodeName: number[], parentIndex: number[], start: number): boolean {
  let parent = parentIndex[start];
  for (let depth = 0; parent !== undefined && parent >= 0 && depth < 10; depth += 1) {
    if (/^(script|style)$/i.test(strings[nodeName[parent] ?? -1] ?? "")) return true;
    parent = parentIndex[parent];
  }
  return false;
}

interface SnapNodes { nodes?: { nodeName?: number[]; nodeValue?: number[]; parentIndex?: number[] } }

// Trích text node SẠCH của 1 document: #text có nội dung + ancestor không phải script/style.
function partsFromDoc(doc: SnapNodes, strings: string[]): string[] {
  const nodeName = doc.nodes?.nodeName ?? [], nodeValue = doc.nodes?.nodeValue ?? [], parentIndex = doc.nodes?.parentIndex ?? [];
  const parts: string[] = [];
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "#text") continue;
    const valueIndex = nodeValue[i];
    if (valueIndex === undefined || valueIndex === -1) continue;
    const text = strings[valueIndex];
    if (typeof text !== "string" || text.trim().length === 0) continue;
    if (parentIndex.length > 0 && junkAncestor(strings, nodeName, parentIndex, i)) continue;
    parts.push(text.trim());
  }
  return parts;
}

// Trích text node (#text → nodeValue index strings) từ DOMSnapshot — đã lọc script/style.
// exported cho test (pattern của repo: unit test helper trực tiếp).
export function partsFromSnapshot(snapshot: unknown): string[] {
  const snap = snapshot as { strings?: string[]; documents?: SnapNodes[] } | undefined;
  const strings = snap?.strings ?? [];
  const parts: string[] = [];
  for (const doc of snap?.documents ?? []) parts.push(...partsFromDoc(doc, strings));
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
  bounds: unknown; // bounds[k]=[x,y,w,h] nested (Edge 155 — uat12) hoặc flat 4 số/node
}

// Gộp mảng node + layout từ captureSnapshot (layout NẰM TRONG documents[0] — không top-level).
function chipArraysFromSnapshot(snapshot: unknown): ChipSnapshot | null {
  const doc = (snapshot as { strings?: string[]; documents?: RawDoc[] } | undefined)?.documents?.[0];
  if (doc?.nodes === undefined || doc?.layout === undefined) return null;
  return {
    strings: (snapshot as { strings?: string[] }).strings ?? [],
    nodeName: doc.nodes.nodeName ?? [],
    nodeValue: doc.nodes.nodeValue ?? [],
    layoutIndex: doc.layout.nodeIndex ?? [],
    bounds: doc.layout.bounds ?? []
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
    const box = boundsAt(data.bounds, k);
    if (box.x === undefined || box.y === undefined || !box.w || box.w <= 0 || !box.h || box.h <= 0) continue;
    found = { text: value, x: box.x, y: box.y, w: box.w, h: box.h };
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
