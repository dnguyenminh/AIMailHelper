// src/background/copilot-submit.ts — uat93/96/98: SOẠN REPLY — submit prompt vào ô chat
// "Message Copilot" (semanticoverview iframe) bằng trusted input (click → insertText → Enter).
// Bài học uat96: bounds DOMSnapshot là toạ độ DOCUMENT (tính cả scroll nội bộ panel) còn
// Input.dispatchMouseEvent cần VIEWPORT → click theo snapshot trượt khi panel đã cuộn
// (snapshot y=962, thật y≈769) → KHÔNG gõ được gì. Fix: DOM.getBoxModel (READ-ONLY, quad
// viewport) lấy điểm click + VERIFY từng bước (reason chi tiết — uat98):
// input-không-thấy / boxmodel-rỗng / gõ-không-vào / enter-không-gửi.
// Bài học uat98: (1) verify phải tìm lại node index trên snapshot MỚI (index cũ lệch sau
// re-render → false-negative); (2) KHÔNG scroll hỗ trợ — synthesizeScrollGesture trên
// iframe target cuộn theo toạ độ TRANG (trúng danh sách mail OWA).
import { copilotTargets } from "./copilot-reader";

const CHAT_INPUT_LABEL = "Message Copilot";
const SETTLE_MS = 450; // chờ React settle sau click/gõ
const SENT_MS = 1200; // chờ exchange render sau Enter
const PROMPT_HEAD = 16; // ký tự đầu prompt — đối chiếu verify

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function clickAt(targetId: string, x: number, y: number): Promise<void> {
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y });
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: "left", buttons: 1, clickCount: 1 });
  await cdpCall(targetId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: "left", buttons: 0, clickCount: 1 });
}

async function pressEnter(targetId: string): Promise<void> {
  await cdpCall(targetId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdpCall(targetId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
}

interface DocLike {
  strings?: string[];
  nodes?: { nodeName?: number[]; nodeValue?: number[]; attributes?: number[][]; parentIndex?: number[]; backendNodeId?: number[] };
  layout?: { nodeIndex?: number[]; bounds?: number[][] };
}

async function captureDoc(targetId: string): Promise<DocLike | null> {
  const snap = await cdpCall<{ strings?: string[]; documents?: DocLike[] }>(targetId, "DOMSnapshot.captureSnapshot", { computedStyles: [] });
  return snap?.documents?.[0] ?? null;
}

// Node SPAN ô chat — trả index trong snapshot + backendNodeId (dùng cho getBoxModel).
function findChatInput(doc: DocLike): { index: number; backendNodeId: number } | null {
  const strings = doc.strings ?? [], nodes = doc.nodes ?? {}, layout = doc.layout ?? {};
  const nodeName = nodes.nodeName ?? [], attributes = nodes.attributes ?? [];
  const kByNode = new Map<number, number>();
  const nodeIndex = layout.nodeIndex ?? [];
  for (let k = 0; k < nodeIndex.length; k += 1) kByNode.set(nodeIndex[k] ?? -1, k);
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "SPAN") continue;
    const attrList = attributes[i] ?? [];
    let labeled = false;
    for (let a = 0; a + 1 < attrList.length; a += 2) {
      if ((strings[attrList[a] ?? -1] ?? "") === "aria-label" && (strings[attrList[a + 1] ?? -1] ?? "") === CHAT_INPUT_LABEL) labeled = true;
    }
    if (labeled === false) continue;
    const b = (layout.bounds ?? [])[kByNode.get(i) ?? -1];
    if (b === undefined || (b[2] ?? 0) < 40) continue; // ghost ẩn
    const id = nodes.backendNodeId?.[i] ?? -1;
    if (id < 0) continue;
    return { index: i, backendNodeId: id };
  }
  return null;
}

// Tâm VIEWPORT của node (quad 8 số = 4 điểm border) — READ-ONLY, đúng toạ độ Input cần.
async function boxCenter(targetId: string, backendNodeId: number): Promise<{ x: number; y: number } | null> {
  const box = await cdpCall<{ model?: { border?: number[] } }>(targetId, "DOM.getBoxModel", { backendNodeId: backendNodeId });
  const q = box?.model?.border ?? [];
  if (q.length < 8) return null;
  const xs = [q[0] ?? 0, q[2] ?? 0, q[4] ?? 0, q[6] ?? 0];
  const ys = [q[1] ?? 0, q[3] ?? 0, q[5] ?? 0, q[7] ?? 0];
  const min = (v: number[]): number => Math.min(...v);
  const max = (v: number[]): number => Math.max(...v);
  return { x: Math.round((min(xs) + max(xs)) / 2), y: Math.round((min(ys) + max(ys)) / 2) };
}

// Text chứa head THUỘC subtree input (walk parentIndex) — phân biệt với echo trong chat.
function inputContains(doc: DocLike, inputIndex: number, head: string): boolean {
  const strings = doc.strings ?? [], nodes = doc.nodes ?? {};
  const nodeName = nodes.nodeName ?? [], nodeValue = nodes.nodeValue ?? [], parentIndex = nodes.parentIndex ?? [];
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "#text") continue;
    const vi = nodeValue[i];
    const text = vi === undefined || vi === -1 ? undefined : strings[vi];
    if (typeof text !== "string" || !text.includes(head)) continue;
    let parent = parentIndex[i];
    for (let depth = 0; parent !== undefined && parent >= 0 && depth < 12; depth += 1) {
      if (parent === inputIndex) return true;
      parent = parentIndex[parent];
    }
  }
  return false;
}

// Số lượt "You said" — baseline trước submit ↔ kiểm tra sau Enter.
function countExchanges(doc: DocLike): number {
  const strings = doc.strings ?? [], nodes = doc.nodes ?? {};
  const nodeName = nodes.nodeName ?? [], nodeValue = nodes.nodeValue ?? [];
  let count = 0;
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "#text") continue;
    const vi = nodeValue[i];
    const text = vi === undefined || vi === -1 ? undefined : strings[vi];
    if (typeof text === "string" && /you said/i.test(text)) count += 1;
  }
  return count;
}

// 1 lần thử trên target ĐÃ xác định có input: click toạ độ viewport (getBoxModel) → gõ →
// verify text vào input (index snapshot MỚI — bài học uat98) → Enter → verify gửi.
async function tryOnce(targetId: string, node: { index: number; backendNodeId: number }, prompt: string, head: string, saidBase: number): Promise<{ result: { submitted: boolean; reason?: string } | null; note?: string }> {
  const point = await boxCenter(targetId, node.backendNodeId);
  if (point === null) return { result: null, note: "boxmodel-rong" };
  console.log("[AIMH][copilot-submit] click input @" + point.x + "," + point.y + " target=" + targetId.slice(0, 6));
  await clickAt(targetId, point.x, point.y);
  await sleep(SETTLE_MS);
  await cdpCall(targetId, "Input.insertText", { text: prompt });
  await sleep(SETTLE_MS);
  const typedDoc = await captureDoc(targetId);
  const typedNode = typedDoc === null ? null : findChatInput(typedDoc);
  if (typedDoc === null || typedNode === null) return { result: null, note: "snapshot-sau-got" };
  if (!inputContains(typedDoc, typedNode.index, head)) return { result: null, note: "got-khong-vao" };
  await pressEnter(targetId);
  await sleep(SENT_MS);
  const sentDoc = await captureDoc(targetId);
  if (sentDoc === null) return { result: { submitted: false, reason: "verify-fail" } };
  const sentNode = findChatInput(sentDoc);
  const grew = countExchanges(sentDoc) > saidBase;
  const cleared = sentNode === null ? true : !inputContains(sentDoc, sentNode.index, head);
  return { result: grew || cleared ? { submitted: true } : { submitted: false, reason: "enter-khong-gui" } };
}

// Dò ĐA target (uat99): OWA re-create panel → iframe CŨ rỗng (không có input) đứng TRƯỚC
// trong danh sách; phải tìm target nào CÓ ô chat input — panel đang render thật.
async function locateChatInput(targets: chrome.debugger.TargetInfo[]): Promise<{ targetId: string; node: { index: number; backendNodeId: number } } | null> {
  for (const target of targets) {
    const id = target.id;
    if (id === undefined) continue;
    await cdpAttach(id);
    const doc = await captureDoc(id);
    const node = doc === null ? null : findChatInput(doc);
    if (node !== null) return { targetId: id, node: node };
    await cdpDetach(id); // target này không có input (iframe cũ) → nhả, dò target kế
  }
  return null;
}

// Submit prompt — KHÔNG ném lỗi; trả { submitted, reason } để UI hiển thị trung thực.
// Retry: dò lại input mỗi vòng (KHÔNG cuộn — uat98: synthesizeScrollGesture trên iframe
// target cuộn theo toạ độ TRANG → trúng danh sách mail OWA, không phải chat).
export async function submitCopilotPrompt(prompt: string): Promise<{ submitted: boolean; reason?: string }> {
  const targets = await copilotTargets(3);
  if (targets.every((t) => t.id === undefined)) return { submitted: false, reason: "no-copilot-target" };
  const head = prompt.slice(0, PROMPT_HEAD);
  let saidBase = -1;
  let lastNote = "?";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await locateChatInput(targets);
    if (found === null) return { submitted: false, reason: "input-khong-thay" };
    try {
      if (saidBase < 0) {
        const baseDoc = await captureDoc(found.targetId);
        if (baseDoc === null) return { submitted: false, reason: "snapshot-fail" };
        saidBase = countExchanges(baseDoc);
      }
      const outcome = await tryOnce(found.targetId, found.node, prompt, head, saidBase);
      if (outcome.result !== null) return outcome.result;
      lastNote = outcome.note ?? lastNote;
    } finally {
      await cdpDetach(found.targetId);
    }
    console.log("[AIMH][copilot-submit] vòng " + (attempt + 1) + " hụt: " + lastNote + " → thử lại");
    await sleep(SETTLE_MS);
  }
  return { submitted: false, reason: lastNote };
}
