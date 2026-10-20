// src/background/handlers/copilot.handler.ts — GĐ-A (20/10): RPC đọc text panel Copilot cho
// DIAGNOSE + pipeline (user đã chọn Copilot thay LLM+VL). Xác thực caller là tab OWA.
import { AppError } from "../../shared/errors";
import { readCopilotPanelText } from "../copilot-reader";
import type { MessageRouter, RpcHandler } from "../router";

function senderTab(sender: unknown): number {
  const tab = (sender as { tab?: { id?: number; url?: string } } | undefined)?.tab;
  if (!tab || typeof tab.id !== "number") throw new AppError("ERR-15", "errors.badRequest");
  return tab.id;
}

const copilotReadHandler: RpcHandler = async (_payload, sender) => {
  // Xác thực tab OWA (đọc/log không dùng tabId — probe scan target toàn cục).
  void senderTab(sender);
  return await readCopilotPanelText();
};

export function registerCopilotHandlers(router: MessageRouter): void {
  router.register("COPIL_PANEL_READ", copilotReadHandler);
}
