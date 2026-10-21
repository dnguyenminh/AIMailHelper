// src/background/copilot-html.ts — 21/10 (uat60): lấy outerHTML lượt trao đổi MỚI NHẤT của
// chatbox Copilot qua CDP READ-ONLY (DOM.getDocument/querySelector(All)/getOuterHTML — SR-12:
// KHÔNG Runtime.evaluate). Message containers: fai-UserMessage / fai-CopilotMessage (uat60).
// Panel render tự dùng CSS riêng (class Copilot không mang rule sang panel — bài học copy thô).
import { copilotTargets } from "./copilot-reader";

const MESSAGE_SELECTOR = '[class*="fai-UserMessage"], [class*="fai-CopilotMessage"]';
const MAX_HTML_CHARS = 120_000; // cap phòng panel phình (outerHTML lượt thường ~3-8k)

function cdpCall<T>(targetId: string, method: string, params: Record<string, unknown>): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ targetId: targetId }, method, params, (result) => {
      void chrome.runtime.lastError; // target hết hạn → resolve undefined (không ném luồng chính)
      resolve(result as T | undefined);
    });
  });
}

async function cdpAttach(targetId: string): Promise<void> {
  try { await chrome.debugger.attach({ targetId: targetId }, "1.3"); } catch { /* đã attach */ }
}

async function cdpDetach(targetId: string): Promise<void> {
  try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
}

// body nodeId → mảng nodeId message (document order). undefined = CDP lỗi bất kỳ bước.
async function messageNodeIds(targetId: string): Promise<number[] | undefined> {
  const root = await cdpCall<{ root?: { nodeId?: number } }>(targetId, "DOM.getDocument", {});
  const rootId = root?.root?.nodeId;
  if (rootId === undefined) return undefined;
  const body = await cdpCall<{ nodeId?: number }>(targetId, "DOM.querySelector", { nodeId: rootId, selector: "body" });
  const bodyId = body?.nodeId;
  if (bodyId === undefined || bodyId === 0) return undefined;
  const msgs = await cdpCall<{ nodeIds?: number[] }>(targetId, "DOM.querySelectorAll", { nodeId: bodyId, selector: MESSAGE_SELECTOR });
  return msgs?.nodeIds;
}

// Lượt MỚI NHẤT = 2 node cuối (UserMessage + CopilotMessage — aria-posinset cặp cuối, uat60).
// outerHTML từng node, nối lại, cap tổng.
async function lastExchangeHtml(targetId: string): Promise<string | undefined> {
  const ids = await messageNodeIds(targetId);
  if (ids === undefined) return undefined;
  if (ids.length === 0) return "";
  const pick = ids.slice(-2);
  let html = "";
  for (const nodeId of pick) {
    const one = await cdpCall<{ outerHTML?: string }>(targetId, "DOM.getOuterHTML", { nodeId: nodeId });
    html += String(one?.outerHTML ?? "");
    if (html.length > MAX_HTML_CHARS) break;
  }
  return html.slice(0, MAX_HTML_CHARS);
}

// API chính: attach → outerHTML lượt cuối → detach LUÔN (kể cả lỗi). Lỗi → { error }.
export async function readCopilotPanelHtml(): Promise<{ html?: string; error?: string }> {
  const [target] = await copilotTargets(1);
  const id = target?.id;
  if (id === undefined) return { error: "no-copilot-target" };
  await cdpAttach(id);
  const html = await lastExchangeHtml(id);
  await cdpDetach(id);
  if (html === undefined) return { error: "cdp-dom-fail" };
  return { html: html };
}
