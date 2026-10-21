// src/content/owa-adapter/copilot-bridge.ts — GĐ-A/B (20/10): phân tích bằng Copilot OWA.
// user quyết định: Copilot THAY LLM+VL. 1 click, KHÔNG gửi mail (BR-01).
// 21/10 (UAT Edge thật): flyout OWA CHỈ nghe event TRUSTED → trigger qua SW Input
// (RPC COPIL_INPUT_*). Poll 90s — panel auto-inject prompt + stream tóm tắt mất 20–70s.
// Đọc READ-ONLY (SR-12): chỉ click nút của Copilot, không gõ prompt.
import { sendMessage } from "../../shared/messaging";
import { filterNewExchange } from "../../shared/copilot-format";
import type { MdNode } from "../../shared/copilot-format";
import type { CancelSignal } from "../../shared/types";
import { copilotMdTree } from "./copilot-sanitize";

const HOVER_POLL_MS = 300; // mỗi vòng chờ popup render sau hover TRUSTED của SW
const HOVER_TRY_MS = 3_500; // tổng thời gian đợi item popup sau hover
const POLL_MS = 3000;
const POLL_ROUNDS = 30; // 30×3s = 90s — đo thật: prompt inject + stream cần 20-70s
const MIN_DELTA_CHARS = 120; // fresh nhỏ hơn ngưỡng → không chắc là tóm tắt thật

export type CopilotTriggerResult = "clicked" | "no-entry" | "popup-not-found";

// CopilotRead/ChipOutcome — trả về của SW (structural); nút Copilot: ưu tiên aria-label,
// fallback #BottomBar child thứ 2 (user chỉ).
interface CopilotRead { text: string; parts: string[]; lines: string[] }
interface ChipOutcome { clicked: boolean; reason: string }

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

// (press tổng hợp đã bỏ — UAT 21/10: isTrusted=false bị flyout bỏ qua)

// Tìm popup item "Summarize this email" (en) / "Tóm tắt email này" (vi). Ưu tiên element
// VISIBLE (ghost ẩn — bài học panel ẩn — bị loại) + nằm trong flyout (menu/tooltip/dialog).
// Dùng cả cho hiển thị describe + lấy toạ độ click.
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

// Chờ item popup sau hover TRUSTED của SW (đã mở flyout thật, không dispatch tổng hợp).
async function waitPopupItem(): Promise<HTMLElement | null> {
  const deadline = Date.now() + HOVER_TRY_MS;
  while (Date.now() < deadline) {
    const item = findSummarizeItem();
    if (item !== null) return item;
    await new Promise((resolve) => setTimeout(resolve, HOVER_POLL_MS));
  }
  return null;
}

// Trigger TRUSTED (21/10): entry toạ độ → SW Input.hover → chờ item → item toạ độ → SW click.
export async function triggerCopilotSummarize(): Promise<CopilotTriggerResult> {
  const entry = findCopilotEntry();
  if (entry === null) return "no-entry";
  const rect = entry.getBoundingClientRect();
  const hover = await sendMessage<{ moved?: string }>("COPIL_INPUT_HOVER",
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  console.log("[AIMH][copilot] hover trusted: " + String(hover.moved ?? "?").slice(0, 60));
  const item = await waitPopupItem();
  if (item === null) return "popup-not-found";
  console.log("[AIMH][copilot] popup item: " + String(item.tagName) + "/" + (item.getAttribute("role") ?? "?"));
  const ir = item.getBoundingClientRect();
  const tapped = await sendMessage<{ outcome?: string }>("COPIL_INPUT_CLICK",
    { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 });
  console.log("[AIMH][copilot] click trusted: " + String(tapped.outcome ?? "?").slice(0, 60));
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

export async function analyzeViaCopilot(signal?: CancelSignal): Promise<{ text: string; html?: MdNode[] } | null> {
  const baseline = await readCopilotPanel();
  const baseSet = new Set(baseline.parts);
  if (signal?.cancelled === true) return null;
  if (findCopilotPanel() !== null) {
    // Panel mở: chip trong panel tạo lượt mới — độc lập layout OWA (flyout hụt khi OWA
    // đổi layout — uat44/45: #BottomBar không còn nút Copilot).
    const chip = await clickChipInPanel();
    if (chip.clicked) {
      console.log("[AIMH][copilot] chip panel: OK → poll");
      return await pollFreshText(baseSet, signal);
    }
    console.log("[AIMH][copilot] chip panel: " + chip.reason + " → thử flyout");
  }
  const trigger = await triggerCopilotSummarize();
  const isCancelled = (): boolean => signal?.cancelled === true;
  if (trigger !== "clicked" || isCancelled()) return null; // hụt entry/popup/hủy → pipeline cũ
  return await pollFreshText(baseSet, signal);
}

// DIFF theo TEXT NODE (đã lọc script/style từ 21/10): node MỚI không ở baseline = tóm tắt
// thật; ổn định 2 vòng + ≥120 chars. KHÔNG dùng text cũ khi trigger fail (bài học 20/10).
// Bài học 21/10: suggestion chip lặp ("Summarize this email" ×N) — dedupe part liền kề trước diff.
function freshParts(current: string[], baseSet: Set<string>): string {
  const deduped = current.filter((part, index) => part !== current[index - 1]);
  return deduped.filter((part) => !baseSet.has(part)).join(" ").trim();
}

// AX tree (CDP READ-ONLY — SR-12): fresh ổn định → đọc 1 lần giữ cấu trúc mục/bullet; cắt từ
// lượt "You said" cuối. Lỗi SW/target → giữ raw. 21/10 (uat60): thêm cây MdNode từ outerHTML
// lượt cuối (fai-User/CopilotMessage) — panel render React giữ 100% heading/bullet/link.
async function withFormat(raw: string): Promise<{ text: string; html?: MdNode[] }> {
  let structured = "", audit = "(rpc-fail thiéu envelope)";
  try {
    const read = await sendMessage<{ text?: string; audit?: string; error?: string }>("COPIL_PANEL_STRUCTURE", {});
    structured = typeof read.text === "string" ? filterNewExchange(read.text) : "";
    audit = typeof read.audit === "string" && read.audit.length > 0 ? (read.error ?? "ok") + " | " + read.audit : "envelope không có audit (SW cũ?)";
  } catch (error) {
    audit = "rpc-throw " + String(error instanceof Error ? error.message : String(error)).slice(0, 70);
  }
  const ok = structured.length >= MIN_DELTA_CHARS && structured.length * 2 >= raw.length;
  console.log("[AIMH][copilot] structure: len=" + structured.length + " raw=" + raw.length + " → " + (ok ? "structured" : "raw") + " | " + audit);
  if (!ok) return { text: raw };
  const html = await copilotMdTree();
  if (html === undefined) console.log("[AIMH][copilot] html: không có/có lỗi — dùng text có \\n");
  return { text: structured, html: html };
}

async function pollFreshText(baseSet: Set<string>, signal?: CancelSignal): Promise<{ text: string; html?: MdNode[] } | null> {
  const isCancelled = (): boolean => signal?.cancelled === true; // flag mutation giữa các await
  let lastFresh = "";
  let stableRounds = 0;
  let chipTries = 0;
  for (let round = 0; round < POLL_ROUNDS; round += 1) {
    if (isCancelled()) return null; // run mới/cancel() — orphan tự chết (uat58)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS)); // chờ Copilot stream...
    if (isCancelled()) return null;
    const current = await readCopilotPanel();
    const fresh = freshParts(current.parts, baseSet);
    chipTries = await maybeClickChip(round, fresh, chipTries);
    if (fresh.length >= MIN_DELTA_CHARS && fresh === lastFresh) {
      stableRounds += 1;
      if (stableRounds >= 2) return await withFormat(fresh); // ổn định 2 vòng → cấu trúc
    } else {
      stableRounds = 0;
    }
    lastFresh = fresh;
  }
  return null; // không có nội dung MỚI đủ dài / chưa ổn định — fallback vision/pipeline cũ
}
