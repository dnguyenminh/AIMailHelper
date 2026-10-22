// src/content/owa-adapter/trusted-scroll.ts — client trusted-scroll (UAT 18/10, SPIKE §7.1).
// OWA mới chỉ nhận input isTrusted: synthetic wheel + scrollTop code đều bị virtualizer bỏ qua.
// chrome.debugger chỉ có ở service worker → content gửi RPC DEBUGGER_SCROLL, SW attach tab
// hiện tại + gửi CDP Input.synthesizeScrollGesture (gesture compositor thật — đã verify).
// An toàn: gesture cuộn KHÔNG mở mail, KHÔNG đổi trạng thái đã đọc (logger xác minh 18/10).
import { sendMessage } from "../../shared/messaging";
import type { DebuggerScrollPayload } from "../../shared/messaging";
import { liveMailList } from "./list-scroller";

const GROW_TIMEOUT_MS = 2500; // chờ OWA materialize/render thêm row sau gesture
const GROW_POLL_MS = 250;
const GESTURE_TIMES = 3;
const GESTURE_DELTA = 1200;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface TrustedScrollResult {
  sent: number;
}

// Bắn chuỗi gesture cuộn tại tâm list (SW attach tab + CDP). deltaY âm = cuộn LÊN, dương = XUỐNG
// (uat63: row-finder cần cuộn lên tìm mail cũ — deep-scan chỉ cần xuống). Ném AppError nếu tab
// không phải OWA / payload sai — caller coi như "cuộn thất bại" và dừng theo no-growth.
export async function trustedScrollBurst(x: number, y: number, deltaY: number = GESTURE_DELTA): Promise<TrustedScrollResult> {
  const payload: DebuggerScrollPayload = { x: x, y: y, deltaY: deltaY, times: GESTURE_TIMES };
  return sendMessage<TrustedScrollResult>("DEBUGGER_SCROLL", payload);
}

// Detach debugger khi quét xong — infobar "đang gỡ lỗi" tự biến mất.
export async function trustedScrollDetach(): Promise<void> {
  await sendMessage("DEBUGGER_DETACH", {});
}

// Cuộn tin cậy + chờ row mới (đếm trên container MỚI trong document — list có thể bị thay).
// Trả true nếu số row tăng = còn nội dung để quét; false = gesture không hiệu lực / hết page.
export async function trustedScrollAdvance(): Promise<boolean> {
  const list = liveMailList();
  if (list === null) return false;
  const before = list.querySelectorAll('[role="option"], [role="listitem"]').length;
  const rect = list.getBoundingClientRect();
  try {
    await trustedScrollBurst(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2));
  } catch (error) {
    console.warn("[AIMH][trusted-scroll] gesture lỗi — dừng cuộn sâu:", error);
    return false;
  }
  for (let waited = 0; waited < GROW_TIMEOUT_MS; waited += GROW_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, GROW_POLL_MS));
    const fresh = liveMailList();
    if (fresh !== null && fresh.querySelectorAll('[role="option"], [role="listitem"]').length > before) return true;
  }
  return false;
}

// uat81 — cuộn LÊN về ĐẦU danh sách bằng trusted gesture (deltaY âm). Bắt buộc trước mỗi lần
// quét sâu: deep-scan trước đó để list ở đáy, mail MỚI nằm trên đỉnh — quét từ đáy = misses.
// Nhận diện "đã ở đỉnh": row đầu tiên không đổi qua 2 burst liên tiếp.
export async function trustedScrollToTop(maxBursts = 30): Promise<boolean> {
  const firstKey = (): string => {
    const box = liveMailList();
    if (box === null) return "";
    const first = box.querySelector('[role="option"], [role="listitem"]');
    return (first?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  };
  const list = liveMailList();
  if (list === null) return false;
  let prev = firstKey();
  let stable = 0;
  for (let i = 0; i < maxBursts; i += 1) {
    const rect = (liveMailList() ?? list).getBoundingClientRect();
    try {
      await trustedScrollBurst(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2), -1200);
    } catch {
      return false;
    }
    await sleep(280);
    const now = firstKey();
    if (now.length > 0 && now === prev) {
      stable += 1;
      if (stable >= 2) return true; // 2 lần liên tiếp row đầu không đổi → đã ở đỉnh
    } else {
      stable = 0;
    }
    prev = now;
  }
  return stable >= 2;
}
