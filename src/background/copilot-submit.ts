// src/background/copilot-submit.ts — uat93: SOẠN REPLY bằng Copilot — submit prompt vào ô
// chat "Message Copilot" (semanticoverview iframe) qua trusted input: click focus →
// Input.insertText(prompt) → Enter. SPIKE uat93 xác minh: input = SPAN contenteditable
// aria-label "Message Copilot"; trusted click + insertText hoạt động trên OWA thật.
import { copilotTargets } from "./copilot-reader";

const CHAT_INPUT_LABEL = "Message Copilot";
const TYPE_SETTLE_MS = 400;

function cdpCall<T>(targetId: string, method: string, params: Record<string, unknown>): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ targetId: targetId }, method, params, (result) => {
      void chrome.runtime.lastError; // frame hết hạn → undefined (caller tự xử lý)
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

async function clickAt(targetId: string, x: number, y: number): Promise<void> {
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y });
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: "left", buttons: 1, clickCount: 1 });
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: "left", buttons: 0, clickCount: 1 });
}

interface DocLike {
  strings?: string[];
  nodes?: { nodeName?: number[]; attributes?: number[][] };
  layout?: { nodeIndex?: number[]; bounds?: number[][] };
}

// Tâm ô chat input trong iframe Copilot (DOMSnapshot iframe — toạ độ iframe viewport).
async function locateChatInput(targetId: string): Promise<{ x: number; y: number } | null> {
  const doc = (await cdpCall<DocLike>(targetId, "DOMSnapshot.captureSnapshot", { computedStyles: [] })) ?? undefined;
  if (doc?.nodes === undefined || doc.layout === undefined) return null;
  const strings: string[] = doc.strings ?? [];
  const nodeName: number[] = doc.nodes.nodeName ?? [], attributes: number[][] = doc.nodes.attributes ?? [];
  const nodeIndex: number[] = doc.layout.nodeIndex ?? [], bounds: number[][] = doc.layout.bounds ?? [];
  const kByNode = new Map<number, number>();
  for (let k = 0; k < nodeIndex.length; k += 1) kByNode.set(nodeIndex[k] ?? -1, k);
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "SPAN") continue;
    const attrList: number[] = attributes[i] ?? [];
    let labeled = false;
    for (let a = 0; a + 1 < attrList.length; a += 2) {
      if ((strings[attrList[a] ?? -1] ?? "") === "aria-label" && (strings[attrList[a + 1] ?? -1] ?? "") === CHAT_INPUT_LABEL) labeled = true;
    }
    if (labeled === false) continue;
    const b = bounds[kByNode.get(i) ?? -1];
    if (Array.isArray(b) === false || (b[2] ?? 0) < 40) continue;
    return { x: Math.round((b[0] ?? 0) + (b[2] ?? 0) / 2), y: Math.round((b[1] ?? 0) + (b[3] ?? 0) / 2) };
  }
  return null;
}

// Submit prompt: attach semanticoverview target → tìm ô chat → click focus → gõ → Enter.
// Trả { submitted: true } hoặc { submitted: false, reason } — KHÔNG ném (caller hiển thị).
export async function submitCopilotPrompt(prompt: string): Promise<{ submitted: boolean; reason?: string }> {
  const [target] = await copilotTargets(1);
  const targetId = target?.id;
  if (targetId === undefined) return { submitted: false, reason: "no-copilot-target" };
  await cdpAttach(targetId);
  const input = await locateChatInput(targetId);
  if (input === null) {
    await cdpDetach(targetId);
    return { submitted: false, reason: "chat-input-khong-thay" };
  }
  await clickAt(targetId, input.x, input.y);
  await new Promise((resolve) => setTimeout(resolve, TYPE_SETTLE_MS));
  await cdpCall(targetId, "Input.insertText", { text: prompt });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await cdpCall(targetId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdpCall(targetId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdpDetach(targetId);
  return { submitted: true };
}
