// src/shared/queue-store.ts — hàng chờ duyệt auto-draft trên chrome.storage.local (TDD §7.2/§7.4).
// Repository pattern như cache-store: MỌI truy cập qua typed wrapper; QUEUE_MAX 200 pending —
// vượt → KHÔNG thêm + console.warn ERR-08 (§7.4 "chống phình vô hạn; vượt → dừng auto-draft").
// FR-GD6-06: tắt auto-mode KHÔNG đụng dữ liệu — module này không biết enabled, chỉ lưu/đọc.
// Reject → loại KHỎI mảng (UC-07 AF-2); Approve → status "approved" giữ lại để truy vết (§8.9).
import { AppError } from "./errors";
import type { QueueItem } from "./types";

export const QUEUE_KEY = "queue.autoDraft";
export const QUEUE_MAX = 200; // §7.4 — cap pending item

const area = (): chrome.storage.StorageArea => chrome.storage.local;

let counter = 0;
const newId = (): string => {
  counter += 1;
  return "queue_" + Date.now() + "_" + counter; // pattern id §6.2 #1 (prefix + ts + counter)
};

// Shape check phòng dữ liệu hỏng từ ngoài (devtools) — entry lạ bị lọc, không làm vỡ list.
function isQueueItem(value: unknown): value is QueueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<QueueItem>;
  return (
    typeof item.id === "string" &&
    typeof item.messageId === "string" &&
    typeof item.draft === "string" &&
    (item.status === "pending" || item.status === "approved" || item.status === "rejected") &&
    typeof item.createdAt === "string"
  );
}

function storageError(operation: string): AppError {
  return new AppError("ERR-08", "errors.storageQuota", { operation: operation });
}

async function write(items: QueueItem[]): Promise<void> {
  try {
    await area().set({ [QUEUE_KEY]: items });
  } catch {
    // §6.3.2: ghi fail → giữ dữ liệu cũ (ERR-08) — caller (controller) hiển thị lỗi.
    throw storageError("queue.set");
  }
}

export async function listQueue(): Promise<QueueItem[]> {
  let raw: unknown;
  try {
    const data = (await area().get(QUEUE_KEY)) as Record<string, unknown>;
    raw = data[QUEUE_KEY];
  } catch {
    throw storageError("queue.get");
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQueueItem);
}

// Thêm 1 pending item khi còn chỗ (< QUEUE_MAX theo số pending); đầy → null + cảnh báo.
// Prune approved cũ nhất khi vượt QUEUE_MAX non-pending — chặn phình storage (§7.4).
export async function addToQueue(input: { messageId: string; draft: string }): Promise<QueueItem | null> {
  const items = await listQueue();
  const pending = items.filter((item) => item.status === "pending");
  if (pending.length >= QUEUE_MAX) {
    console.warn("[AIMH][queue] ERR-08: QUEUE_MAX " + QUEUE_MAX + " — từ chối thêm, dừng auto-draft (§7.4)");
    return null;
  }
  const item: QueueItem = {
    id: newId(),
    messageId: input.messageId,
    draft: input.draft,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  const nonPending = items.filter((item2) => item2.status !== "pending").slice(-QUEUE_MAX);
  await write([...pending, item, ...nonPending]);
  return item;
}

// QUEUE_UPDATE (§6.1 #8) — CHỈ "approved"|"rejected" (validate ở handler); id không tồn tại/
// không pending → null. Reject → loại khỏi mảng; Approve → status approved (giữ để truy vết).
export async function updateQueueStatus(id: string, status: "approved" | "rejected"): Promise<QueueItem | null> {
  const items = await listQueue();
  const found = items.find((item) => item.id === id && item.status === "pending");
  if (!found) return null;
  const next =
    status === "rejected" ? items.filter((item) => item.id !== id) : items.map((item) => (item.id === id ? { ...item, status: "approved" as const } : item));
  await write(next);
  return { ...found, status: status };
}
