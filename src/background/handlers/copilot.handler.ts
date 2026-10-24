// src/background/handlers/copilot.handler.ts — GĐ-A (20/10): RPC đọc text panel Copilot cho
// DIAGNOSE + pipeline (user đã chọn Copilot thay LLM+VL). Xác thực caller là tab OWA.
// 21/10 — COPIL_CHIP_CLICK: bấm chip "Summarize this email" TRONG panel khi panel mở nhưng
// trống (bấm nút entry chỉ mở panel — học UAT 20/10); đường submit đáng tin cuối cùng.
// 21/10 (UAT tự động) — COPIL_INPUT_HOVER / COPIL_INPUT_CLICK: flyout OWA CHỈ nghe event
// trusted; content script gởi toạ độ, SW dispatch Input thật qua chrome.debugger + tab.
import { AppError } from "../../shared/errors";
import { readCopilotPanelText, triggerCopilotChip } from "../copilot-reader";
import { readCopilotStructuredText } from "../copilot-structure";
import { readCopilotPanelHtml } from "../copilot-html";
import { copilInputHover, copilInputClick } from "../copilot-input";
import { submitCopilotPrompt } from "../copilot-submit";
import type { MessageRouter, RpcHandler } from "../router";

interface InputPoint { x?: number; y?: number }

function tabIdOf(ctx: unknown): number {
  const tab = (ctx as { tab?: { id?: number; url?: string } } | undefined)?.tab;
  if (!tab || typeof tab.id !== "number") throw new AppError("ERR-15", "errors.badRequest");
  return tab.id;
}

const validateOwaCaller = tabIdOf; // (ui cũ dùng tên này — ERR-15 như trước)

function pointOf(payload: unknown): { x: number; y: number } {
  const p = (payload as InputPoint | null | undefined) ?? {};
  return { x: Number(p.x ?? 0), y: Number(p.y ?? 0) };
}

const copilotReadHandler: RpcHandler = async (_payload, ctx) => {
  // Xác thực tab OWA (đọc/log không dùng tabId — probe scan target toàn cục).
  validateOwaCaller(ctx);
  return await readCopilotPanelText();
};

const copilotChipHandler: RpcHandler = async (_payload, ctx) => {
  validateOwaCaller(ctx);
  return await triggerCopilotChip();
};

const copilotHoverHandler: RpcHandler = async (payload, ctx) => {
  return { moved: await copilInputHover(tabIdOf(ctx), pointOf(payload)) };
};

const copilotClickHandler: RpcHandler = async (payload, ctx) => {
  return { outcome: await copilInputClick(tabIdOf(ctx), pointOf(payload)) };
};

const copilotStructureHandler: RpcHandler = async (_payload, ctx) => {
  validateOwaCaller(ctx);
  return await readCopilotStructuredText();
};

const copilotHtmlHandler: RpcHandler = async (_payload, ctx) => {
  validateOwaCaller(ctx);
  return await readCopilotPanelHtml();
};

// uat93 — soạn reply: prompt do CS dựng từ tone/ngôn ngữ/hướng dẫn (≤4000 ký tự).
const copilotReplyHandler: RpcHandler = async (payload, ctx) => {
  validateOwaCaller(ctx);
  const prompt = (payload as { prompt?: unknown } | null | undefined)?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 4000) {
    throw new AppError("ERR-15", "errors.badRequest");
  }
  return await submitCopilotPrompt(prompt);
};

export function registerCopilotHandlers(router: MessageRouter): void {
  router.register("COPIL_PANEL_READ", copilotReadHandler);
  router.register("COPIL_CHIP_CLICK", copilotChipHandler);
  router.register("COPIL_PANEL_STRUCTURE", copilotStructureHandler);
  router.register("COPIL_PANEL_HTML", copilotHtmlHandler);
  router.register("COPIL_INPUT_HOVER", copilotHoverHandler);
  router.register("COPIL_INPUT_CLICK", copilotClickHandler);
  router.register("COPIL_REPLY_SUBMIT", copilotReplyHandler);
}
