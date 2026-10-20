// src/background/frame-discovery.ts — phát hiện frame preview phục vụ đọc bằng CDP (UAT 20/10).
// Bài học: getTargets() KHÔNG liệt kê iframe OOPIF nếu chưa attach trang cha (probe lần 1 → 0
// frame; UC-09 text attach OWA trước → thấy officeapps). Module này hợp 3 đường phát hiện:
//   (1) getTargets() type=iframe — đường cũ;
//   (2) Target.setAutoAttach flatten + event Target.attachedToTarget — frame con do Chrome gắn;
//   (3) Page.getFrameTree — cây frame đầy đủ (kể cả frame KHÔNG có target riêng → chỉ insight).
// SR-12: CHỈ ĐỌC — không Runtime.evaluate; waitForDebuggerOnStart=false (không treo frame con).
import { ensureAttachedShared } from "./debugger-scroll";
import { redactSrc } from "../shared/redact";

export { redactSrc }; // giữ API cũ cho preview-probe (sau này chuyển hết sang shared)

export interface DiscoveredFrame {
  targetId?: string; // thiếu → không attach trực tiếp được (chỉ qua frame tree)
  url: string; // nguyên bản (dùng để fetch ảnh); báo cáo PHẢI redact trước khi in
  attached: boolean;
  via: "target" | "event" | "tree";
}

// event auto-attach — listener LAZY-INSTALL (chỉ khi discoverFrames chạy thật, tránh phá test env).
const eventFrames: chrome.debugger.TargetInfo[] = [];
let listenerInstalled = false;
function ensureEventListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  chrome.debugger.onEvent.addListener((_source, method, params) => {
    if (method !== "Target.attachedToTarget") return;
    const info = (params as { targetInfo?: chrome.debugger.TargetInfo } | undefined)?.targetInfo;
    if (info !== undefined && info.id !== undefined) eventFrames.push(info);
  });
}

export function getTargets(): Promise<chrome.debugger.TargetInfo[]> {
  return new Promise((resolve) => chrome.debugger.getTargets((targets) => resolve(targets ?? [])));
}

export function sendSnapshot(targetId: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ targetId: targetId }, "DOMSnapshot.captureSnapshot", { computedStyles: [] }, (result) => {
      void chrome.runtime.lastError; // frame hết hạn/đóng — resolve undefined
      resolve(result);
    });
  });
}

export function sendSnapshotTab(tabId: number): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId: tabId }, "DOMSnapshot.captureSnapshot", { computedStyles: [] }, (result) => {
      void chrome.runtime.lastError;
      resolve(result);
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Bật flat auto-attach cho session tab (kết quả chỉ vào lines — lỗi cũng là dữ liệu).
async function autoAttach(tabId: number, lines: string[]): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.debugger.sendCommand({ tabId: tabId }, "Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, () => {
      const err = chrome.runtime.lastError;
      lines.push(err !== undefined ? "setAutoAttach ERR: " + String(err.message ?? "").slice(0, 70) : "setAutoAttach OK");
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

interface FrameEntry {
  frame?: { id?: string; url?: string };
  childFrames?: FrameEntry[];
}

// Duyệt cây frame → dòng indent cho report (redact sẵn) + node để match với target.
// SKIP frame gốc (url trùng tabUrl — nó chính là target tab, không phải frame con).
function walkFrameTree(entry: FrameEntry, depth: number, lines: string[], out: DiscoveredFrame[], skipUrl: string): void {
  const id = String(entry?.frame?.id ?? "?");
  const url = entry?.frame?.url ?? "";
  lines.push("  ".repeat(depth) + "frame " + id.slice(0, 8) + " " + redactSrc(url));
  if (url.length > 0 && url !== skipUrl) out.push({ url: url, attached: false, via: "tree" });
  for (const child of entry?.childFrames ?? []) walkFrameTree(child, depth + 1, lines, out, skipUrl);
}

export interface DiscoveryResult {
  frames: DiscoveredFrame[];
  lines: string[]; // chuỗi REDACT sẵn từ SW — báo cáo in nguyên (M-2: không token lọt)
}

// Khám phá frame của tab: attach trang cha (điều kiện) → auto-attach → getTargets + event +
// frame tree. Dùng chung cho probe UC-09 lẫn readPreviewImages (đ 20/10).
export async function discoverFrames(tabId: number, tabUrl: string | undefined): Promise<DiscoveryResult> {
  ensureEventListener(); // đăng ký 1 lần — an toàn test (không gọi ở môi trường không có chrome)
  await ensureAttachedShared(tabId, tabUrl);
  const lines: string[] = [];
  eventFrames.length = 0; // chỉ nhận event của lần chạy NÀY
  await autoAttach(tabId, lines);
  await sleep(700); // chờ event auto-attach về; frame load tự nhiên (không waitForDebugger)
  const targets = await getTargets();
  // Dump ĐẦY ĐỦ (bài học 20/10 run 2: cap 10 đều là worker → iframe sau cap bị che).
  const workers = targets.filter((t) => (t.type as string) === "worker");
  const nonWorker = targets.filter((t) => (t.type as string) !== "worker");
  lines.push("target worker=" + String(workers.length) + " | còn lại=" + String(nonWorker.length) + " trên tổng " + String(targets.length));
  for (const [index, t] of nonWorker.slice(0, 30).entries()) {
    lines.push("target #" + String(index) + " " + String(t.type ?? "?") + " attached=" + (t.attached === true ? "A" : "-") + " url=" + redactSrc(t.url ?? ""));
  }
  const frames: DiscoveredFrame[] = [];
  for (const t of targets) {
    if ((t.type as string) !== "iframe" || t.id === undefined) continue;
    frames.push({ targetId: t.id, url: t.url ?? "", attached: t.attached === true, via: "target" });
  }
  for (const info of eventFrames.slice(0, 8)) {
    if (info.id === undefined || frames.some((f) => f.targetId === info.id)) continue;
    frames.push({ targetId: info.id, url: info.url ?? "", attached: false, via: "event" });
    lines.push("event " + String(info.type ?? "?") + " id=" + String(info.id).slice(0, 8) + " url=" + redactSrc(info.url ?? ""));
  }
  const tree = await new Promise<unknown>((resolve) => {
    chrome.debugger.sendCommand({ tabId: tabId }, "Page.getFrameTree", undefined, (result) => {
      void chrome.runtime.lastError;
      resolve(result);
    });
  });
  const frameEntry = (tree as { frameTree?: FrameEntry } | undefined)?.frameTree;
  if (frameEntry !== undefined) walkFrameTree(frameEntry, 0, lines, frames, tabUrl ?? "");
  else lines.push("getFrameTree: không có kết quả");
  // frame tree — insight cho frame không có target riêng (cùng-process hoặc Edge ẩn target)
  return { frames: frames.slice(0, 8), lines: lines.slice(0, 30) };
}
