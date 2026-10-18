// src/background/attachment-capture.ts — "nghe trộm" bytes attachment mà OWA TỰ tải khi mở
// preview (UAT 18/10, Plan A). OWA tự xác thực (Bearer của nó) — ta chỉ quan sát qua CDP
// Network events trên session debugger đã attach (dùng chung với trusted-scroll — 1 infobar).
// Bảo mật: CHỈ tab OWA từ sender; body cap 3MB/file; bỏ qua asset (ảnh/font/css/js/telemetry).
import { ensureAttachedShared } from "./debugger-scroll";

const MAX_FILES = 5;
const MAX_BODY_BYTES = 3_000_000;
const ASSET_NOISE = /imageB2|\.png|\.jpe?g|\.svg|\.gif|\.woff2?|\.css|\.js(\?|$)|\.wasm|\.ico|telemetry|loki\.|arc\.msn|browser\.events|notificationchannel|GetPersona|persona|presence/i;

export interface CapturedFile {
  url: string;
  mime: string;
  base64: string;
}

interface CaptureState {
  requests: Map<string, { url: string; mime: string }>;
  files: CapturedFile[];
}

const captures = new Map<number, CaptureState>();
let listenerRegistered = false;

function isActiveCapture(source: chrome.debugger.Debuggee): boolean {
  return source.tabId !== undefined && captures.has(source.tabId);
}

function looksLikeContent(url: string): boolean {
  return !ASSET_NOISE.test(url) && /outlook\.|office\.|microsoft\.|sharepoint\.|office365/.test(url);
}

// Bắt response body: requestWillBeSent (ghi requestId) → responseReceived (mime) →
// loadingFinished (lấy body qua Network.getResponseBody — CHỈ với request đã track).
function handleDebuggerEvent(source: chrome.debugger.Debuggee, method: string, params: unknown): void {
  if (!isActiveCapture(source) || source.tabId === undefined) return;
  const state = captures.get(source.tabId) as CaptureState;
  const p = params as { requestId?: string; url?: string; response?: { mimeType?: string; url?: string }; args?: unknown };
  const requestId = p.requestId ?? "";
  if (method === "Network.requestWillBeSent" && p.url) {
    if (looksLikeContent(p.url)) state.requests.set(requestId, { url: p.url, mime: "application/octet-stream" });
    return;
  }
  if (method === "Network.responseReceived" && state.requests.has(requestId)) {
    const tracked = state.requests.get(requestId) as { url: string; mime: string };
    tracked.mime = p.response?.mimeType ?? tracked.mime;
    return;
  }
  if (method === "Network.loadingFinished" && state.requests.has(requestId)) {
    void void captureBody(source.tabId, state, requestId);
  }
}

async function captureBody(tabId: number, state: CaptureState, requestId: string): Promise<void> {
  if (state.files.length >= MAX_FILES) return;
  const tracked = state.requests.get(requestId);
  if (!tracked) return;
  try {
    const result = (await chrome.debugger.sendCommand({ tabId: tabId }, "Network.getResponseBody", { requestId: requestId })) as
      | { body?: string; base64Encoded?: boolean }
      | undefined;
    const body = result?.body ?? "";
    if (body.length === 0 || body.length > MAX_BODY_BYTES) return;
    state.files.push({
      url: tracked.url,
      mime: tracked.mime,
      base64: result?.base64Encoded === false ? btoa(body).slice(0, MAX_BODY_BYTES) : body
    });
  } catch {
    /* body không lấy được (stream/đã discard) — bỏ qua */
  }
}

// Bắt đầu capture cho tab (attach + Network.enable). Reset buffer mỗi lần start.
export async function startCapture(tabId: number, tabUrl: string | undefined): Promise<void> {
  const target = await ensureAttachedShared(tabId, tabUrl);
  await chrome.debugger.sendCommand(target, "Network.enable", {});
  captures.set(tabId, { requests: new Map<string, { url: string; mime: string }>(), files: [] });
}

// Trả files đã bắt (cap MAX_FILES) + reset state (Network.disable để sạch listener phía trình duyệt).
export async function collectCapture(tabId: number): Promise<CapturedFile[]> {
  const state = captures.get(tabId);
  captures.delete(tabId);
  if (!state) return [];
  try {
    await chrome.debugger.sendCommand({ tabId: tabId }, "Network.disable", {});
  } catch {
    /* session có thể đã detach — im lặng */
  }
  return state.files.slice(0, MAX_FILES);
}

// Đăng ký listener sự kiện debugger (gọi từ registerAttachmentHandlers — KHÔNG chạy lúc import).
export function registerCaptureListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  chrome.debugger.onEvent.addListener(handleDebuggerEvent);
}
