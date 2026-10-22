// src/background/debugger-scroll.ts — trusted-scroll qua chrome.debugger (UAT 18/10, SPIKE §7.1).
// OWA mới chỉ phản ứng với input isTrusted: synthetic wheel + scrollTop code đều bị bỏ qua.
// CDP Input.synthesizeScrollGesture = gesture compositor thật — ĐÃ VERIFY trên trang thật:
// window trượt ✓, KHÔNG mở mail / KHÔNG đổi trạng thái đã đọc (logger event: chỉ wheel/scroll).
// Bảo mật (SR-12):
//   1. Attach CHỈ tab gửi request (sender.tab — KHÔNG nhận tabId từ payload).
//   2. Whitelist CDP command: CHỈ Input.synthesizeScrollGesture — KHÔNG BAO GIỜ Runtime.evaluate.
//   3. Chỉ attach tab OWA (4 domain trong manifest).
//   4. TTL 90s + detach tường minh khi quét xong + onDetach dọn state.
import { AppError } from "../shared/errors";

const OWA_HOSTS = ["outlook.office.com", "outlook.office365.com", "outlook.live.com", "outlook.cloud.microsoft"];
const ATTACH_TTL_MS = 90_000;
const ALLOWED_COMMAND = "Input.synthesizeScrollGesture";

interface AttachedSession {
  target: chrome.debugger.Debuggee;
  timer: ReturnType<typeof setTimeout>;
}

const attached = new Map<number, AttachedSession>();

export function registerDetachCleanup(): void {
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) attached.delete(source.tabId);
  });
}

// Test-only — module state (attached) sống qua các test; reset để mỗi test khởi từ trắng.
export function resetSessionsForTests(): void {
  for (const session of attached.values()) clearTimeout(session.timer);
  attached.clear();
}

function isOwaTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return OWA_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function scheduleDetach(tabId: number): void {
  const session = attached.get(tabId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    void detachTab(tabId);
  }, ATTACH_TTL_MS);
}

async function ensureAttached(tabId: number, tabUrl: string | undefined): Promise<chrome.debugger.Debuggee> {
  if (!isOwaTabUrl(tabUrl)) {
    throw new AppError("ERR-15", "errors.badRequest");
  }
  const existing = attached.get(tabId);
  if (existing) {
    scheduleDetach(tabId);
    return existing.target;
  }
  const target = { tabId: tabId };
  await chrome.debugger.attach(target, "1.3");
  attached.set(tabId, { target: target, timer: setTimeout(() => void detachTab(tabId), ATTACH_TTL_MS) });
  return target;
}

// Dùng chung cho attachment-capture (cùng session debugger — 1 infobar cho cả scroll + capture).
export const ensureAttachedShared = ensureAttached;

export async function detachTab(tabId: number): Promise<void> {
  const session = attached.get(tabId);
  if (!session) return;
  attached.delete(tabId);
  clearTimeout(session.timer);
  try {
    await chrome.debugger.detach(session.target);
  } catch {
    /* tab đã đóng / đã detach — im lặng */
  }
}

// Gửi `times` gesture cuộn tại (x, y). deltaY > 0 = cuộn XUỐNG, deltaY < 0 = cuộn LÊN
// (CDP synthesizeScrollGesture: yDistance âm = cuộn xuống, DƯƠNG = cuộn lên — uat83: trước
// đây Math.abs() khiến pha "cuộn lên" của 👁/↗ cũng thành cuộn xuống → không bao giờ tìm thấy).
export async function scrollTab(tabId: number, tabUrl: string | undefined, x: number, y: number, deltaY: number, times: number): Promise<number> {
  const target = await ensureAttached(tabId, tabUrl);
  scheduleDetach(tabId);
  for (let index = 0; index < times; index += 1) {
    await chrome.debugger.sendCommand(target, ALLOWED_COMMAND, {
      x: x, y: y, xDistance: 0, yDistance: -deltaY, speed: 700
    });
  }
  return times;
}
