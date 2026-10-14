// src/content/modules/automode-types.ts — types UI/orchestration cho auto-mode GĐ6 (TDD §3.7/§5.5).
// Tách khỏi automode.ts để giữ file ≤ 200 dòng (§1.4 #7); KHÔNG cài logic (§4.5).
import type { PortEvent, StreamRequestPayloads } from "../../shared/messaging";
import type { StreamHandle } from "../../shared/port-client";
import type { AutomationConfig, EmailData, PromptsConfig, QueueItem } from "../../shared/types";
import type { InsertDecision, InsertOutcome } from "../owa-adapter/actions";

export interface AutoModeError {
  code: string;
  i18nKey: string; // render theo uiLanguage (BR-08 — không chứa key/body)
  params?: Record<string, string>;
}

export interface ApproveSummary {
  approved: number;
  failed: number;
  failedIds: string[]; // AF-5 — item lỗi KHÔNG bị nuốt, báo danh sách sau
}

export interface AutoModeState {
  enabled: boolean; // BR-02 — false mặc định
  processing: boolean; // đang analyze/draft email mới
  pendingCount: number; // badge "N chờ duyệt"
  queueFull: boolean; // QUEUE_MAX 200 — cảnh báo dừng auto-draft (§7.4)
  lastError: AutoModeError | null; // ERR-06/ERR-09/EF-6/EF-1…
  mismatchId: string | null; // EF-5 — email nguồn không còn mở, giữ pending
  summary: ApproveSummary | null; // AF-5 — tổng kết Approve all
}

export type ApproveOutcome =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "needs-confirm"; existing: string } // AF-5 actions — compose có nội dung sẵn
  | { kind: "mismatch" } // EF-5 — KHÔNG chèn, giữ pending + cảnh báo
  | { kind: "not-found" }
  | { kind: "insert-failed"; code: "ERR-09" }; // EF-2 — item VỀ pending

export type ApproveAllResult =
  | { kind: "summary"; summary: ApproveSummary }
  | { kind: "needs-confirm"; existing: string }; // dừng — panel hỏi replace/append rồi gọi lại

// Observer seam — automode.ts KHÔNG tự đụng DOM OWA: target qua adapter (observeTarget),
// MutationObserver bọc trong factory injectable (test dùng fake, CR-C biên DOM giữ nguyên).
export interface AutoObserver {
  observe(target: Element): void;
  disconnect(): void;
}
export type ObserverFactory = (onMutations: () => void) => AutoObserver;

// kind "analyze" (pipeline GĐ3) + kind "reply" (draft GĐ4, KHÔNG chèn) qua Port stream.
export type AutoStreamRequest = (
  kind: "analyze" | "reply",
  payload: StreamRequestPayloads["analyze"] | StreamRequestPayloads["reply"],
  onEvent: (event: PortEvent) => void
) => StreamHandle;

export interface AutoModeDeps {
  getAutomation: () => Promise<AutomationConfig>; // enabled + rules + throttleMs (BR-02/BR-13)
  getPrompts: () => Promise<PromptsConfig>; // tone/language mặc định cho draft (CONFIG_SET prompts)
  readEmail: () => Promise<EmailData>; // GĐ3 reader qua adapter — ERR-06/ERR-10 ném ra
  observeTarget: () => Promise<Element | null>; // inbox-list container qua adapter (BR-02)
  observerFactory: ObserverFactory;
  request: AutoStreamRequest;
  insertDraft: (draft: string, decision?: InsertDecision) => Promise<InsertOutcome>; // GĐ4 actions
  currentMessageId: () => Promise<string | null>; // email ĐANG MỞ — so khớp EF-5
  listQueue: () => Promise<QueueItem[]>;
  addToQueue: (input: { messageId: string; draft: string }) => Promise<QueueItem | null>; // QUEUE_MAX gate
  updateStatus: (id: string, status: "approved" | "rejected") => Promise<QueueItem | null>;
  schedule: (fn: () => void, delayMs: number) => void; // throttle mutation — injectable (test)
  onState: (state: AutoModeState) => void;
}

export const IDLE_AUTO: AutoModeState = {
  enabled: false,
  processing: false,
  pendingCount: 0,
  queueFull: false,
  lastError: null,
  mismatchId: null,
  summary: null
};
