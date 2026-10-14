// src/background/handlers/queue.handler.ts — QUEUE_LIST/QUEUE_UPDATE (TDD §6.1 #7-8).
// GĐ1 stub: GĐ6 cài đặt thật (Approve → chèn qua actions — UC-07; Reject → loại; BR-01 no-Send).
import { notImplementedError } from "../../shared/errors";
import type { MessageRouter } from "../router";

export function registerQueueHandlers(router: MessageRouter): void {
  router.register("QUEUE_LIST", async () => {
    throw notImplementedError("GĐ6");
  });
  router.register("QUEUE_UPDATE", async () => {
    throw notImplementedError("GĐ6");
  });
}
