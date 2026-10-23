// src/content/modules/digest-types.ts — types UI/orchestration cho triage (TDD §3.7 GĐ5; §6.2 #7).
// Tách khỏi digest.ts để giữ file ≤ 200 dòng (§1.4 #7); KHÔNG cài logic (§4.5).
import type { AutomationConfig, TriageScore } from "../../shared/types";
import type { InboxItem } from "../owa-adapter/triage";
import type { BatchRequest } from "./digest-batch";

export interface TriageProgress { done: number; total: number; failed: number }

export interface DigestEntry {
  messageId: string;
  subject: string;
  sender: string;
  score: number;
  reason: string; // hiển thị Digest (AC4 US-08; ≤300 — TD-8)
  ariaKey?: string; // uat92 — vân tay aria-label row (👁/↗ tra lại O(1) qua attribute query)
}

export interface TriageError {
  code: string;
  i18nKey: string; // render theo uiLanguage (BR-08 — không chứa key/body)
  params?: Record<string, string>;
}

export interface TriageUiState {
  status: "idle" | "running" | "done" | "error";
  progress: TriageProgress;
  cachedSkipped: number; // BR-09 — item đã có cache, không gọi LLM
  cap: number; // triageCap áp dụng lần quét này (hiển thị EF-5)
  overflow: number; // EF-5 — item vượt cap chờ "Quét tiếp"
  folderStopped: boolean; // EF-2/EF-4 — dừng an toàn, giữ kết quả
  userStopped: boolean; // user bấm Dừng giữa chừng
  error: TriageError | null; // lỗi cuối (EF-3 — kèm số failed)
  digest: DigestEntry[]; // sort score giảm dần (FR-GD5-04) — cập nhật dần (AF-1 UC-04)
}

export interface TriageDeps {
  collectItems: (opts?: { full?: boolean }) => Promise<InboxItem[]>; // BR-07; uat80: full=true bỏ watermark
  folderSignature: () => Promise<Element | null>; // EF-2/EF-4 — mốc folder trước scan
  hasFolderChanged: (before: Element | null) => Promise<boolean>; // check trước mỗi batch
  getCached: (ids: string[]) => Promise<Map<string, TriageScore>>; // BR-09
  saveScores: (scores: TriageScore[]) => Promise<void>; // ghi GỘP batch (§3.3)
  attachBadge: (messageId: string, score: number) => void; // FR-GD5-03
  getAutomation: () => Promise<AutomationConfig>; // batchSize/throttleMs/triageCap (AF-3 UC-03)
  collectUnreadTop: () => Promise<InboxItem[]>; // uat80 — refresh nhẹ: mail chưa đọc ĐANG hiển thị
  request: BatchRequest; // Port "triage-batch" (§6.2)
  sleep: (ms: number) => Promise<void>; // throttle/backoff — injectable (test)
  onState: (state: TriageUiState) => void;
}
