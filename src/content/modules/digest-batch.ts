// src/content/modules/digest-batch.ts — 1 batch triage + retry/backoff (FSD 6.6d; FR-GD5-02).
// HTTP-level retry 429 Retry-After / 1-2-4s / 5xx 2-4-8s đã nằm trong call.ts GĐ2 (CHỈ
// pre-first-chunk — tái dùng nguyên văn). Ở đây là batch-level (6.6d): MAX_RETRY_BATCH 3,
// backoff throttleMs → ×2 → cap 10s; retryable CHỈ ERR-03 (429) / ERR-16 (5xx) — lỗi khác
// (ERR-15/02/11/14) retry vô ích (§9.2). Hết lượt → item "chưa chấm" (EF-3), batch sau vẫn chạy.
import type { PortEvent } from "../../shared/messaging";
import type { StreamHandle } from "../../shared/port-client";
import { parseTriageScores } from "../../shared/triage";
import type { TriageItem, TriageScore } from "../../shared/types";

export const MAX_RETRY_BATCH = 3; // FSD 6.6d
export const MAX_BACKOFF_MS = 10_000; // cap backoff (6.6d)

export interface BatchError {
  code: string;
  i18nKey: string;
  params?: Record<string, string>;
  retryable: boolean;
}

export interface BatchResult {
  scores: TriageScore[]; // phần tử ĐÃ validate (TD-8/FR-GD5-06 — phần reject bị bỏ)
  error: BatchError | null; // null = request thành công (có thể 0 score hợp lệ)
  cancelled: boolean;
}

export type BatchRequest = (batch: TriageItem[], onEvent: (event: PortEvent) => void) => StreamHandle;

export const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Chạy 1 batch qua Port + vòng retry 6.6d. cancel() hủy request đang chạy + resolve cancelled
// ngay (PortClient bỏ qua mọi event sau cancel — §6.2 #5 — nên promise phải tự settle).
export function runBatchWithRetry(
  request: BatchRequest,
  batch: TriageItem[],
  throttleMs: number,
  sleep: (ms: number) => Promise<void> = defaultSleep
): { promise: Promise<BatchResult>; cancel: () => void } {
  let active: StreamHandle | null = null;
  let cancelResolve: ((result: BatchResult) => void) | null = null;
  const cancelPromise = new Promise<BatchResult>((resolve) => {
    cancelResolve = resolve;
  });
  const attempt = async (): Promise<BatchResult> => {
    let backoffMs = throttleMs; // 6.6d — backoff bắt đầu từ throttleMs
    for (let count = 1; count <= MAX_RETRY_BATCH; count += 1) {
      const result = await attemptOnce(request, batch, (handle) => {
        active = handle;
      });
      if (result.error === null) return result;
      if (!result.error.retryable || count === MAX_RETRY_BATCH) return result; // hết lượt → "chưa chấm"
      await sleep(Math.min(backoffMs, MAX_BACKOFF_MS));
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS); // throttleMs → 2× → ... cap 10s
    }
    return { scores: [], error: null, cancelled: false }; // không bao giờ tới (loop return hết)
  };
  return {
    promise: Promise.race([attempt(), cancelPromise]),
    cancel: () => {
      active?.cancel(); // PortClient bỏ qua event trễ — attempt treo vô hại (race đã resolve)
      cancelResolve?.({ scores: [], error: null, cancelled: true });
    }
  };
}

// 1 lần chạy batch: request qua Port → gom chunk (scores JSON) → done parse / error trả về.
function attemptOnce(request: BatchRequest, batch: TriageItem[], setActive: (handle: StreamHandle) => void): Promise<BatchResult> {
  return new Promise((resolve) => {
    let raw = "";
    const expectedIds = new Set(batch.map((item) => item.messageId));
    const handle = request(batch, (event: PortEvent) => {
      if (event.type === "chunk") {
        raw += event.delta;
        return;
      }
      if (event.type === "done") {
        resolve({ scores: parseTriageScores(raw, expectedIds), error: null, cancelled: false });
        return;
      }
      if (event.type === "error") {
        resolve({
          scores: [],
          error: { code: event.code, i18nKey: event.i18nKey, params: event.params, retryable: event.retryable },
          cancelled: false
        });
      }
    });
    setActive(handle);
  });
}
