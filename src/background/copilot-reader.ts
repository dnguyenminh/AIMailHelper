// src/background/copilot-reader.ts — GĐ-A (20/10): đọc text panel Copilot của OWA qua CDP.
// User quyết định: Copilot thay LLM+VL cho phân tích email. Panel chat là iframe cross-origin
// (cacheable-iframe:*copilotSidePanel*) → đường duy nhất khả thi: attach target type iframe
// hoặc other (Edge 155 — xem frame-discovery.isFrameCandidate) + DOMSnapshot (CHỈ ĐỌC — SR-12).
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

const MAX_COPILOT_CHARS = 60_000;
const MAX_PARTS = 5000; // giữ ĐUÔI (node mới nằm cuối chat); đuôi cũ bị gọi là chấp nhận

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
  const targets = await getTargets();
  const candidates = targets.filter((t) =>
    isFrameCandidate(t) && t.id !== undefined && COPILOT_URL_PATTERN.test(t.url ?? ""))
    .sort((a, b) => copilotRank(a.url ?? "") - copilotRank(b.url ?? ""))
    .slice(0, 3);
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
