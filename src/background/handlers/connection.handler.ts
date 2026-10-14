// src/background/handlers/connection.handler.ts — TEST_CONNECTION/LIST_MODELS (TDD §6.1 #4-5).
// GĐ1 stub: cài đặt thật ở GĐ2 (adapter testConnection 15s hard timeout; listModels tolerant — §3.2).
import { notImplementedError } from "../../shared/errors";
import type { MessageRouter } from "../router";

export function registerConnectionHandlers(router: MessageRouter): void {
  router.register("TEST_CONNECTION", async () => {
    throw notImplementedError("GĐ2");
  });
  router.register("LIST_MODELS", async () => {
    throw notImplementedError("GĐ2");
  });
}
