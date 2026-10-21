// src/background/copilot-structure.ts — SW đọc snapshot panel Copilot, tái tạo CẤU TRÚC (SR-12).
// 21/10 — heading/đoạn/bullet giữ được nhờ LAYOUT BOUNDS (AX tree không expose role cho
// markdown Copilot — chỉ generic/staticText). Lỗi attach/snapshot rỗng → trả error,
// bridge giữ text thô (không chặn luồng thành công của Copilot).
import { copilotTargets } from "./copilot-reader";
import { sendSnapshot } from "./frame-discovery";
import { structureFromSnapshot } from "./../shared/copilot-format";
import type { RawSnapshot } from "./../shared/copilot-format";

// Pick target xếp hạng 0 (semanticoverview) → attach → DOMSnapshot → text theo dòng/block.
// Bài học 21/10 uat18~22: sendSnapshot KHÔNG tự attach → lastError → len=0; SW sống dai
// (ritm RPC giữ alive) nên có thể chạy bundle cũ → AUDIT trả về qua RPC (content log).
export async function readCopilotStructuredText(): Promise<{ text?: string; error?: string; audit?: string }> {
  const [target] = await copilotTargets(1); // xpath0 — panel OWA thời điểm hiện tại
  const id = target?.id;
  if (id === undefined) return { error: "no-copilot-target", audit: "no-copilot-target" };
  const url = String(target?.url ?? "").slice(0, 55).replace(/[?&][a-z]+=/gi, "_=");
  const mark = target?.attached === true ? " [A]" : " [-]";
  const audit: string[] = ["target=" + id.slice(0, 10) + " " + url + mark];
  let attachErr = "";
  try { await chrome.debugger.attach({ targetId: id }, "1.3"); } catch (error) { attachErr = String(error instanceof Error ? error.message : error).slice(0, 60); }
  const snapshot = await sendSnapshot(id) as RawSnapshot | undefined;
  try { await chrome.debugger.detach({ targetId: id }); } catch (error2) { void error2; /* ignore */ }
  const text = snapshot === undefined ? "" : structureFromSnapshot(snapshot);
  audit.push("attach=" + (attachErr.length > 0 ? attachErr : "ok"));
  audit.push("snap: docs=" + String(snapshot?.documents?.length ?? -1) + " strings=" + String(snapshot?.strings?.length ?? -1));
  audit.push("len=" + text.length);
  return text.length > 0 ? { text: text, audit: audit.join(" ") } : { error: "snapshot-empty", audit: audit.join(" ") };
}
