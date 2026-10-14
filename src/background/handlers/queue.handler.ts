// src/background/handlers/queue.handler.ts — QUEUE_LIST/QUEUE_UPDATE (TDD §6.1 #7-8; GĐ6 UC-07).
// Validate BR-15: status CHỈ nhận "approved"|"rejected" — giá trị khác → ERR-15; id rỗng hoặc
// không tồn tại/không pending → ERR-15. Việc CHÈN draft (actions.insertDraft) nằm ở content
// script (Panel/AutoModeQueue) — Panel chỉ gọi QUEUE_UPDATE sau khi chèn thành công; SW không
// đụng DOM và KHÔNG có đường code nào điều khiển nút gửi của OWA (BR-01 — no-Send §8.5).
import { AppError } from "../../shared/errors";
import { listQueue, updateQueueStatus } from "../../shared/queue-store";
import type { MessageRouter } from "../router";

const QUEUE_STATUSES = ["approved", "rejected"] as const;
type QueueStatus = (typeof QUEUE_STATUSES)[number];

function isQueueStatus(value: unknown): value is QueueStatus {
  return typeof value === "string" && (QUEUE_STATUSES as readonly string[]).includes(value);
}

function badRequest(field: string, allowed: string): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: field, allowed: allowed });
}

export function registerQueueHandlers(router: MessageRouter): void {
  router.register("QUEUE_LIST", async () => listQueue());
  router.register("QUEUE_UPDATE", async (payload) => {
    const raw = (payload ?? {}) as Record<string, unknown>;
    const id = raw["id"];
    if (typeof id !== "string" || id.trim().length === 0) throw badRequest("id", "non-empty string");
    if (!isQueueStatus(raw["status"])) throw badRequest("status", QUEUE_STATUSES.join("|")); // ERR-15 — giá trị lạ
    const updated = await updateQueueStatus(id, raw["status"]);
    if (updated === null) throw badRequest("id", "existing pending item");
    return { ok: true };
  });
}
