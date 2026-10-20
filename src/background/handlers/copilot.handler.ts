// src/background/handlers/copilot.handler.ts — GĐ-A (20/10): RPC đọc text panel Copilot cho
// DIAGNOSE + pipeline (user đã chọn Copilot thay LLM+VL). Xác thực caller là tab OWA.
// 21/10 — COPIL_CHIP_CLICK: bấm chip "Summarize this email" TRONG panel khi panel mở nhưng
// trống (bấm nút entry chỉ mở panel — học UAT 20/10); đường submit đáng tin cuối cùng.
import { AppError } from "../../shared/errors";
import { readCopilotPanelText, triggerCopilotChip } from "../copilot-reader";
import type { MessageRouter, RpcHandler } from "../router";

function validateOwaCaller(ctx: unknown): void {
  const tab = (ctx as { tab?: { id?: number; url?: string } } | undefined)?.tab;
  if (!tab || typeof tab.id !== "number") throw new AppError("ERR-15", "errors.badRequest");
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

export function registerCopilotHandlers(router: MessageRouter): void {
  router.register("COPIL_PANEL_READ", copilotReadHandler);
  router.register("COPIL_CHIP_CLICK", copilotChipHandler);
}
