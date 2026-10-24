// src/background/copilot-structure.ts — SW đọc snapshot panel Copilot, tái tạo CẤU TRÚC (SR-12).
// 21/10 — heading/đoạn/bullet giữ được nhờ LAYOUT BOUNDS (AX tree không expose role cho
// markdown Copilot — chỉ generic/staticText). Lỗi attach/snapshot rỗng → trả error,
// bridge giữ text thô (không chặn luồng thành công của Copilot).
import { copilotTargets } from "./copilot-reader";
import { sendSnapshot } from "./frame-discovery";
import { structureFromSnapshot } from "./../shared/copilot-format";
import type { RawSnapshot } from "./../shared/copilot-format";

// Dò ĐA target (uat99): OWA re-create panel Copilot → iframe CŨ rỗng vẫn nằm TRƯỚC trong
// danh sách target; copilotTargets(1) nhắm nhầm bản cũ → snapshot rỗng (strings=132) →
// mất format. Dò tối đa 3 target, giữ bản text DÀI NHẤT (panel đang render thật).
export async function readCopilotStructuredText(): Promise<{ text?: string; error?: string; audit?: string }> {
  const targets = await copilotTargets(3);
  if (targets.length === 0) return { error: "no-copilot-target", audit: "no-copilot-target" };
  const audit: string[] = [];
  let best = "", bestAudit = "";
  for (const target of targets) {
    const id = target.id;
    if (id === undefined) continue;
    const mark = target.attached === true ? " [A]" : " [-]";
    let attachErr = "";
    try { await chrome.debugger.attach({ targetId: id }, "1.3"); } catch (error) { attachErr = String(error instanceof Error ? error.message : error).slice(0, 40); }
    const snapshot = await sendSnapshot(id) as RawSnapshot | undefined;
    try { await chrome.debugger.detach({ targetId: id }); } catch { /* ignore */ }
    const text = snapshot === undefined ? "" : structureFromSnapshot(snapshot);
    audit.push(id.slice(0, 6) + mark + " strings=" + String(snapshot?.strings?.length ?? -1) + " len=" + text.length);
    if (text.length > best.length) {
      best = text;
      bestAudit = "target=" + id.slice(0, 10) + mark + " attach=" + (attachErr.length > 0 ? attachErr : "ok");
    }
    if (best.length >= 120) break; // đủ dài — đây là panel thật, không dò tiếp
  }
  const full = (bestAudit.length > 0 ? bestAudit + " | " : "") + audit.join(" ; ");
  return best.length > 0 ? { text: best, audit: full } : { error: "snapshot-empty", audit: full };
}
