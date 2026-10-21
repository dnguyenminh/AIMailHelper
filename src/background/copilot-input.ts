// src/background/copilot-input.ts — Input.dispatchMouseEvent TRUSTED từ SW qua chrome.debugger.
// UAT 21/10: flyout OWA ("Summarize this email") chỉ nghe event trusted — dispatchEvent tổng
// hợp từ content script KHÔNG mở popup (2/2 lần fail). Content script gởi toạ độ, SW bấm
// chuột thật như user: hover entry (2 lần mouseMoved) → click tâm item popup.

interface Point { x: number; y: number }

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// attach tab: trả về "ok" hoặc message lỗi trả về nguyên văn (đã attach — session vẫn dùng được).
async function attachTab(tabId: number): Promise<string> {
  return new Promise((resolve) => chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
    const err = chrome.runtime.lastError;
    void chrome.runtime.lastError;
    resolve(String(err?.message ?? "ok"));
  }));
}

function dispatchInput(tabId: number, params: { [key: string]: unknown }): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", params, () => { void chrome.runtime.lastError; resolve(); });
  });
}

async function detachTab(tabId: number): Promise<void> {
  await new Promise<void>((resolve) => { chrome.debugger.detach({ tabId: tabId }, () => { void chrome.runtime.lastError; resolve(); }); });
}

// attach → run → detach (đủ 2 nhánh, kể cả throw) — không giữ client CDP.
async function withTab(tabId: number, run: (tabId: number) => Promise<void>): Promise<string> {
  const attachMsg = await attachTab(tabId);
  try { await run(tabId); return attachMsg; }
  finally { await detachTab(tabId); }
}

// Hover entry: mouseMoved lệch (intent) → mouseMoved tâm. Edge popup mở sau ~1s dwell.
// 21/10 (uat58): 2 pipeline song song → attach({tabId}) chồng nhau → "Another debugger
// already attached" → chuỗi trigger fail → panel treo "Đang phân tích…". FIFO serialize
// để hover/click KHÔNG BAO GIỜ chạy đồng thời (defense-in-depth ngoài cancel signal).
let inputChain: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const next = inputChain.then(task, task);
  inputChain = next.then(() => undefined, () => undefined);
  return next;
}

export function copilInputHover(tabId: number, point: Point): Promise<string> {
  return queued(() => withTab(tabId, async (id) => {
    await dispatchInput(id, { type: "mouseMoved", x: point.x - 120, y: point.y + 40 });
    await sleep(350);
    await dispatchInput(id, { type: "mouseMoved", x: point.x, y: point.y });
    await sleep(1200);
  }));
}

// Trusted click tâm element (press → release, clickCount 1) — tương đương bấm chuột thật.
export function copilInputClick(tabId: number, point: Point): Promise<string> {
  return queued(() => withTab(tabId, async (id) => {
    await dispatchInput(id, { type: "mouseMoved", x: point.x, y: point.y });
    await dispatchInput(id, { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
    await dispatchInput(id, { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
  }));
}

// Nhãn gọn cho DIAGNOSE — chỉ đưa status, không toạ độ (M-2).
export function inputLines(tabId: number, msg: string): string[] {
  return ["copilot-input tab=" + String(tabId) + " → " + msg.slice(0, 80)];
}
