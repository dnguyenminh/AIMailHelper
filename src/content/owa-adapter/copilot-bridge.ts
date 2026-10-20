// src/content/owa-adapter/copilot-bridge.ts — GĐ-A/B (20/10): phân tích bằng Copilot OWA.
// user quyết định: Copilot THAY LLM+VL. Luồng (duy nhất 1 click, KHÔNG gửi mail):
//  nút panel AIMH "Phân tích Copilot" → hover nút Copilot ở BottomBar (user chỉ: #BottomBar > div:nth-child(2))
//  → popup "Summarize this email" hiện → click → chatbox mở sidebar → SW đọc text qua CDP.
// Click là hành động của USER (chủ động bấm nút của extension) — đúng phạm vi AutoMode (BR-01).
import { sendMessage } from "../../shared/messaging";

const SETTLE_MS = 500;
const POLL_MS = 2000;
const POLL_ROUNDS = 6; // 6×2s = 12s tối đa chờ stream — Copilot tóm tắt email dài cần 5-15s
const MIN_DELTA_CHARS = 120; // fresh nhỏ hơn ngưỡng → không chắc là summary thật

export type CopilotTriggerResult = "clicked" | "no-entry" | "popup-not-found";

// Cấu trúc trả về của SW (structural — không import module background vào content)
interface CopilotRead {
  text: string;
  parts: string[];
  lines: string[];
}

// Nút Copilot: ưu tiên aria-label (ổn định), fallback cấu trúc #BottomBar child thứ 2 (user chỉ).
export function findCopilotEntry(): HTMLElement | null {
  const bar = document.querySelector("#BottomBar");
  if (bar === null) return null;
  const labeled = Array.from(bar.querySelectorAll<HTMLElement>("button[aria-label]"))
    .find((b) => /copilot/i.test(b.getAttribute("aria-label") ?? ""));
  if (labeled !== undefined) return labeled;
  return bar.querySelector<HTMLElement>("div:nth-child(2) button") ?? null;
}

// Panel chat mở chưa — iframe id bắt đầu "cacheable-iframe:" + chứa copilotSidePanel (user chỉ).
export function findCopilotPanel(): HTMLIFrameElement | null {
  return Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))
    .find((f) => /copilotSidePanel/i.test(f.id)) ?? null;
}

function dispatchHover(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const opts = { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 } as MouseEventInit;
  target.dispatchEvent(new MouseEvent("mouseover", opts));
  target.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
  target.dispatchEvent(new MouseEvent("mousemove", opts));
}

// Tìm popup item "Summarize this email" (en) / "Tóm tắt email này" (vi) trong popup đang mở.
export function findSummarizeItem(): HTMLElement | null {
  const names = ["summarize this email", "tóm tắt email này"];
  const items = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="menuitem"], [role="button"], [role="menuitemradio"], button'
  ));
  return items.find((b) => {
    const text = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().toLowerCase();
    return names.some((name) => text.includes(name));
  }) ?? null;
}

// Trigger: hover entry → chờ popup → click item. LUÔN trigger mới (bài học 20/10: panel ẩn
// vẫn còn trong DOM → đọc text CŨ nhầm là summary — chương trình cần text tươi). KHÔNG gõ prompt.
export async function triggerCopilotSummarize(sleepMs = SETTLE_MS): Promise<CopilotTriggerResult> {
  const entry = findCopilotEntry();
  if (entry === null) return "no-entry";
  dispatchHover(entry);
  await new Promise((r) => setTimeout(r, sleepMs));
  const item = findSummarizeItem();
  if (item === null) return "popup-not-found";
  (item as HTMLElement).click();
  return "clicked";
}

// Diagnostics M-2: trạng thái entry/popup/panel — id iframe GUID redact (không lọt token).
export function describeCopilotLines(): string[] {
  const lines: string[] = [];
  const entry = findCopilotEntry();
  lines.push("copilot entry: " + (entry === null ? "KHÔNG THẤY (#BottomBar)" : entry.getAttribute("aria-label") ?? "(label trống)"));
  const item = findSummarizeItem();
  lines.push("summarize popup item: " + (item === null ? "không hiện (hover chưa mở)" : "HIện"));
  const panel = findCopilotPanel();
  lines.push("panel chat: " + (panel === null ? "đóng" : "MỞ (id ẩn GUID — cacheable-iframe:*)"));
  return lines;
}

// ── GĐ-B 20/10 — analyzeViaCopilot: trigger "Summarize this email" + đọc ổn định text panel ──

// Đọc panel qua SW (CDP into iframe cross-origin). Lỗi (SW ngủ/không response) → struct rỗng.
async function readCopilotPanel(): Promise<CopilotRead> {
  try {
    return await sendMessage<CopilotRead>("COPIL_PANEL_READ", {});
  } catch {
    return { text: "", parts: [], lines: [] };
  }
}

// Bấm "Summarize this email" (hành động USER — nút bắt đầu từ panel extension) → DIFF theo
// TEXT NODE: node MỚI (không có ở baseline) = tóm tắt thật. Ổn định 2 vòng + đủ dài → dùng.
// Học 20/10: KHÔNG dùng text cũ khi trigger fail (panel ẩn + cap giữ text LỊCH SỬ, không tươi).
export async function analyzeViaCopilot(): Promise<{ text: string } | null> {
  const baseline = await readCopilotPanel();
  const baseSet = new Set(baseline.parts);
  const trigger = await triggerCopilotSummarize();
  if (trigger === "no-entry" || trigger === "popup-not-found") return null; // fallback pipeline cũ
  let lastFresh = "";
  let stableRounds = 0;
  for (let round = 0; round < POLL_ROUNDS; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS)); // chờ Copilot stream...
    const current = await readCopilotPanel();
    const fresh = current.parts.filter((part) => !baseSet.has(part)).join(" ").trim();
    if (fresh.length >= MIN_DELTA_CHARS && fresh === lastFresh) {
      stableRounds += 1;
      if (stableRounds >= 2) return { text: fresh }; // ổn định 2 vòng liên tiếp → giữ
    } else {
      stableRounds = 0;
    }
    lastFresh = fresh;
  }
  return null; // không có nội dung MỚI đủ dài / chưa ổn định — fallback vision/pipeline cũ
}
