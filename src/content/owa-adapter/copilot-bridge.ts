// src/content/owa-adapter/copilot-bridge.ts — GĐ-A/B (20/10): phân tích bằng Copilot OWA.
// user quyết định: Copilot THAY LLM+VL. Luồng (duy nhất 1 click, KHÔNG gửi mail):
//  nút panel AIMH "Phân tích" → hover nút Copilot ở BottomBar → popup "Summarize this email"
//  → click → chatbox mở sidebar → SW đọc text qua CDP.
// Học UAT 20/10: bấm item popup chỉ MỞ panel, summary KHÔNG tự chạy (panel trống) + hover
// đơn thuần mouse không mở popup (Fluent nghe pointer*). Fix 21/10: hover đủ pointer+mouse,
// chờ item tối đa 2.5s (hover lại mỗi 300ms), press chuỗi event đầy đủ; poll text vẫn trống
// → SW click ĐÚNG chip "Summarize this email" trong panel qua CDP Input (trusted). Đọc text
// luôn READ-ONLY (SR-12) — chỉ click nút của Copilot, không gõ prompt, không gửi mail (BR-01).
import { sendMessage } from "../../shared/messaging";

const HOVER_POLL_MS = 300; // mỗi vòng chờ popup render (async) sau khi hover lại
const HOVER_TRY_MS = 2_500; // tổng thời gian đợi popup — 1 lần 500ms cũ dễ miss khi page bận
const POLL_MS = 2000;
const POLL_ROUNDS = 6; // 6×2s = 12s — Copilot tóm tắt email dài cần 5-15s
const MIN_DELTA_CHARS = 120; // fresh nhỏ hơn ngưỡng → không chắc là tóm tắt thật

export type CopilotTriggerResult = "clicked" | "no-entry" | "popup-not-found";

// Cấu trúc trả về của SW (structural — không import module background vào content)
interface CopilotRead {
  text: string;
  parts: string[];
  lines: string[];
}

// Kết quả click chip submit trong panel (SW CDP — Input trusted)
interface ChipOutcome {
  clicked: boolean;
  reason: string;
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

function centerInit(target: HTMLElement): PointerEventInit {
  const rect = target.getBoundingClientRect();
  return { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

// Hover ĐỦ event: Fluent (OWA) nghe POINTER — chỉ dispatch mouse là popup không mở.
function dispatchHover(target: HTMLElement): void {
  const opts = centerInit(target);
  target.dispatchEvent(new PointerEvent("pointerover", opts));
  target.dispatchEvent(new PointerEvent("pointerenter", { ...opts, bubbles: false }));
  target.dispatchEvent(new PointerEvent("pointermove", opts));
  target.dispatchEvent(new MouseEvent("mouseover", opts));
  target.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
  target.dispatchEvent(new MouseEvent("mousemove", opts));
}

// Tìm popup item "Summarize this email" (en) / "Tóm tắt email này" (vi). Ưu tiên element
// VISIBLE (ghost ẩn — bài học panel ẩn — bị loại) + nằm trong flyout (menu/tooltip/dialog).
export function findSummarizeItem(): HTMLElement | null {
  const names = ["summarize this email", "tóm tắt email này"];
  const all = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="menuitem"], [role="button"], [role="menuitemradio"], [role="tooltip"], button'));
  const visible = all.filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  const pool = visible.length > 0 ? visible : all;
  const matches = (el: HTMLElement) => {
    const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().toLowerCase();
    return names.some((name) => text.includes(name));
  };
  const flyout = pool.filter((el) =>
    el.closest('[role="menu"], [role="tooltip"], [role="dialog"], [role="listbox"]') !== null);
  return flyout.find(matches) ?? pool.find(matches) ?? null;
}

// Press đầy đủ: pointerdown→mousedown→focus→pointerup→mouseup→click với toạ độ tâm element
// (MouseEvent("click") đơn lẻ bị Fluent menu item bỏ qua — học UAT 20/10).
function pressElement(el: HTMLElement): void {
  const opts = centerInit(el);
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  try { el.focus(); } catch { /* không focus được — click vẫn gửi */ }
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.click();
}

// Trigger: hover entry → chờ item tối đa 2.5s (hover lại mỗi 300ms) → press item.
export async function triggerCopilotSummarize(): Promise<CopilotTriggerResult> {
  const entry = findCopilotEntry();
  if (entry === null) return "no-entry";
  let item = findSummarizeItem();
  const deadline = Date.now() + HOVER_TRY_MS;
  while (item === null && Date.now() < deadline) {
    dispatchHover(entry);
    await new Promise((resolve) => setTimeout(resolve, HOVER_POLL_MS));
    item = findSummarizeItem();
  }
  if (item === null) return "popup-not-found";
  console.log("[AIMH][copilot] popup item: " + String(item.tagName) + "/" + (item.getAttribute("role") ?? "?"));
  pressElement(item);
  return "clicked";
}

// Diagnostics M-2: trạng thái entry/popup/panel — id iframe GUID redact (không lọt token).
export function describeCopilotLines(): string[] {
  const lines: string[] = [];
  const entry = findCopilotEntry();
  lines.push("copilot entry: " + (entry === null ? "KHÔNG THẤY (#BottomBar)" : entry.getAttribute("aria-label") ?? "(label trống)"));
  const item = findSummarizeItem();
  lines.push("summarize popup item: " + (item === null ? "không hiện (hover chưa mở)" :
    String(item.tagName) + " role=" + (item.getAttribute("role") ?? "?")));
  const panel = findCopilotPanel();
  lines.push("panel chat: " + (panel === null ? "đóng" : "MỞ (id ẩn GUID — cacheable-iframe:*)"));
  return lines;
}

// ── GĐ-B 20/10 — analyzeViaCopilot: trigger "Summarize this email" + đọc ổn định text panel ──

// Đọc panel qua SW (CDP vào iframe cross-origin). Lỗi (SW ngủ/không response) → struct rỗng.
async function readCopilotPanel(): Promise<CopilotRead> {
  try {
    return await sendMessage<CopilotRead>("COPIL_PANEL_READ", {});
  } catch {
    return { text: "", parts: [] as string[], lines: [] as string[] };
  }
}

// Chip fallback (21/10): panel mở nhưng trống → submit chưa chạy. SW click chip qua CDP Input.
async function clickChipInPanel(): Promise<ChipOutcome> {
  try {
    return await sendMessage<ChipOutcome>("COPIL_CHIP_CLICK", {});
  } catch {
    return { clicked: false, reason: "sw-busy" };
  }
}

// Click chip submit tối đa 2 lần khi panel chưa có nội dung tươi (99 = đã click ok — ngừng).
async function maybeClickChip(round: number, fresh: string, chipTries: number): Promise<number> {
  if (round < 1 || fresh.length !== 0 || chipTries >= 2) return chipTries;
  const chip = await clickChipInPanel();
  console.log("[AIMH][copilot] panel trống → click chip: " + (chip.clicked ? "OK" : chip.reason));
  return chip.clicked ? 99 : chipTries + 1;
}

export async function analyzeViaCopilot(): Promise<{ text: string } | null> {
  const baseline = await readCopilotPanel();
  const baseSet = new Set(baseline.parts);
  const trigger = await triggerCopilotSummarize();
  if (trigger === "no-entry" || trigger === "popup-not-found") return null; // fallback pipeline cũ
  return await pollFreshText(baseSet);
}

// DIFF theo TEXT NODE: node MỚI (không có ở baseline) = tóm tắt thật, ổn định 2 vòng + đủ dài.
// Bài học 20/10: KHÔNG dùng text cũ khi trigger fail (panel ẩn + cap giữ text LỊCH SỬ, không
// tươi) — fresh rỗng → thường xuyên click chip trong panel (chỉ KHI fresh rỗng mới click).
async function pollFreshText(baseSet: Set<string>): Promise<{ text: string } | null> {
  let lastFresh = "";
  let stableRounds = 0;
  let chipTries = 0;
  for (let round = 0; round < POLL_ROUNDS; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS)); // chờ Copilot stream...
    const current = await readCopilotPanel();
    const fresh = current.parts.filter((part) => !baseSet.has(part)).join(" ").trim();
    chipTries = await maybeClickChip(round, fresh, chipTries);
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
