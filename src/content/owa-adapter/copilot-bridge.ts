// src/content/owa-adapter/copilot-bridge.ts — GĐ-A/B (20/10): phân tích bằng Copilot OWA.
// user quyết định: Copilot THAY LLM+VL. Luồng (duy nhất 1 click, KHÔNG gửi mail):
//  nút panel AIMH "Phân tích Copilot" → hover nút Copilot ở BottomBar (user chỉ: #BottomBar > div:nth-child(2))
//  → popup "Summarize this email" hiện → click → chatbox mở sidebar → SW đọc text qua CDP.
// Click là hành động của USER (chủ động bấm nút của extension) — đúng phạm vi AutoMode (BR-01).
import { sendMessage } from "../../shared/messaging";

const SETTLE_MS = 500;
const POLL_MS = 2500;
const POLL_ROUNDS = 4;
const COPILOT_MIN_TEXT = 400; // dưới ngưỡng → coi như chưa có summary thật (UI rác)
const MIN_DELTA_CHARS = 120; // delta nhỏ hơn → không chắc là summary → trả full text (LLM chính tự lọc)

// Bóc CHỈ phần MỚI: chat append cuối → current nêu trên baseline là tiền tố → delta = phần đuôi.
// Không khớp tiền tố (React re-render) → trả full text — an toàn hơn là bỏ lần chạy này.
function freshText(baseline: string, current: string): string {
  if (current.startsWith(baseline) === false) return current.trim();
  const delta = current.slice(baseline.length).trim();
  return delta.length >= MIN_DELTA_CHARS ? delta : current.trim();
}

export type CopilotTriggerResult = "clicked" | "no-entry" | "popup-not-found";

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

async function readCopilotText(): Promise<string> {
  const read = await sendMessage<{ text: string; lines: string[] }>("COPIL_PANEL_READ", {});
  return read.text;
}

// Bấm "Summarize this email" (hành động USER — bấm nút của extension) → chờ text panel TƯƠI
// (khác baseline) + ỔN ĐỊNH (2 vòng liên tiếp bằng nhau) → trả text. Fail → null (fallback).
export async function analyzeViaCopilot(): Promise<{ text: string } | null> {
  const baseline = await readCopilotText(); // text CŨ trong panel (kể cả panel ẩn) — làm chuẩn so sánh
  const trigger = await triggerCopilotSummarize();
  if (trigger === "no-entry" || trigger === "popup-not-found") {
    if (baseline.length > COPILOT_MIN_TEXT) return { text: baseline }; // panel đang mở sẵn (user mở)
    return null; // không trigger được + không có text — caller fallback
  }
  let lastText = ""; let stableRounds = 0;
  for (let round = 0; round < POLL_ROUNDS; round += 1) {
    await new Promise((r) => setTimeout(r, POLL_MS)); // chờ Copilot stream summary...
    const text = await readCopilotText();
    const stable = text.length > 0 && text === lastText;
    if (stable && text.length > COPILOT_MIN_TEXT && text !== baseline) {
      stableRounds += 1;
      if (stableRounds >= 2) return { text: freshText(baseline, text) }; // text TƯƠI — ưu tiên delta
    } else {
      stableRounds = 0;
    }
    lastText = text;
  }
  return null; // không tươi hơn baseline / không ổn định — fallback vision
}
