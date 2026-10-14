// src/background/handlers/locator.handler.ts — LOCATOR_RESOLVE (TDD §6.1 #6).
// GĐ1 stub: GĐ3 cài đặt thật — build prompt locate → chat (temperature 0, maxTokens 512) → refId.
import { notImplementedError } from "../../shared/errors";
import type { MessageRouter } from "../router";

export function registerLocatorHandlers(router: MessageRouter): void {
  router.register("LOCATOR_RESOLVE", async () => {
    throw notImplementedError("GĐ3");
  });
}
