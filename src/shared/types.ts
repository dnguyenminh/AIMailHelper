// src/shared/types.ts — entities chuẩn hóa (TDD §7.2) + config sections (§6.3). KHÔNG cài logic.
import type { LLMConfig, ProviderId } from "./llm/types";

export type { ChatMessage, ChatOptions, LLMConfig, LLMResponse, ProviderId, TestConnectionResult } from "./llm/types";

export type UiLanguage = "vi" | "en";
export type KeyStorage = "sync" | "local";
export type ReplyTone = "chinh-thuc" | "than-mat" | "ngan-gon";
export type ReplyLanguage = "auto" | "vi" | "en";

// §6.3 — config.general (keyStorage canonical ở ĐÂY — DISC-1).
export interface GeneralConfig {
  uiLanguage: UiLanguage;
  keyStorage: KeyStorage;
  extensionEnabled: boolean;
}

export interface PromptsConfig {
  customSystemPrompt: string | null;
  defaultTone: ReplyTone;
  replyLanguage: ReplyLanguage; // ĐỘC LẬP uiLanguage (BR-11)
}

// BR-13: rules rỗng / rule rỗng → KHÔNG tự draft (chỉ analyze).
export interface AutoModeRule {
  senderPattern?: string;
  subjectPattern?: string;
  bodyPattern?: string; // UAT — từ khóa trong nội dung email (Outlook: "with specific words in the body")
  toPattern?: string; // UAT — gửi đến ai (email/tên)
  ccPattern?: string; // UAT — Cc chứa
  hasAttachment?: boolean; // UAT — chỉ email có đính kèm (true) / bỏ qua điều kiện (undefined)
  minImportance?: number; // 0..100
}

export interface AutomationConfig {
  enabled: boolean; // mặc định false — BR-02 fail-closed
  rules: AutoModeRule[];
  batchSize: number; // default 5
  throttleMs: number; // default 1000
  triageCap: number; // default 50 (#10)
}

export interface VisionConfig {
  enabled: boolean; // mặc định false — BR-03
}

export interface AppConfig {
  general: GeneralConfig;
  prompts: PromptsConfig;
  automation: AutomationConfig;
  vision: VisionConfig;
  activeProvider: ProviderId;
}

// §6.1 #1 — CONFIG_GET response: KHÔNG BAO GIỜ trả apiKey nguyên văn (BR-08).
// config = field phi nhạy cảm (model/baseUrl/azure/local) để Options prefill form — GĐ2 amendment.
export interface ProviderStatus {
  hasKey: boolean;
  keyStorage: KeyStorage;
  config: Omit<LLMConfig, "apiKey"> | null;
}

export interface ConfigGetResponse extends AppConfig {
  providers: Record<ProviderId, ProviderStatus>;
}

// §6.1 #9 — GET_RUNTIME_STATE (FR-GD1-02).
export interface RuntimeState {
  extensionEnabled: boolean;
  providerActive: ProviderId;
  autoModeEnabled: boolean;
}

// §7.2 — EmailData. bodyText rỗng → chặn gọi LLM (BR-14, gate ở reader).
export interface EmailData {
  messageId: string; // strategy chain §7.5; thiếu → triage bỏ qua (FR-GD5-06)
  subject: string;
  sender: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bodyText: string;
  hasAttachment: boolean; // UAT — phát hiện đính kèm trong pane (rules + triage)
  threadContext?: { subject: string; from: string; excerpt: string }[]; // chỉ khi conversation (AF-1)
  detectedView: "reading-pane" | "popout" | "conversation";
}

// §7.2 — AnalysisResult (validate 6.6f fail-closed; caps §8.11 lớp 3 — GĐ3).
export interface AnalysisResult {
  summary: string;
  importanceScore: number; // 0..100
  importanceLabel: "cao" | "trung-binh" | "thap"; // >=70 cao, >=40 trung-binh, <40 thap
  intent: string;
  actions: string[];
  deadline: string | null; // ISO date
  sentiment: string;
}

// §7.2 — ReplyDraft. draftContent rỗng → vô hiệu nút chèn (BR-10).
export interface ReplyDraft {
  draftContent: string;
  tone: ReplyTone;
  language: ReplyLanguage;
  extraInstructions?: string;
  createdAt: string; // ISO datetime
}

// §7.2 — TriageScore: khóa cache messageId (BR-07/BR-09), LRU 500 (#10).
export interface TriageScore {
  messageId: string;
  score: number; // 0..100
  reason: string;
  analyzedAt: string; // ISO — freshness + LRU evict
}

// §4.2/§6.2 — 1 item triage gửi qua Port kind "triage-batch" (BR-07 — chỉ item đang hiển thị).
export interface TriageItem {
  messageId: string; // strategy chain §7.5 (S1/S2/S3); thiếu → item bị bỏ qua (FR-GD5-06)
  subject: string;
  sender: string;
  snippet: string;
}

// §7.2 — LocatorCacheEntry (BR-06: layoutHash khác → vô hiệu).
// INVARIANT #8: entry PERSISTED bắt buộc strategy="selector" (refId chết cùng JS context,
// chỉ tồn tại trong session cache in-memory — không bao giờ ghi xuống storage).
export interface LocatorCacheEntry {
  functionKey: string;
  strategy: "selector" | "refId";
  value: string;
  layoutHash: string;
  savedAt: string;
}

// §7.2 — QueueItem (GĐ6): QUEUE_MAX 200 (#10); giữ khi tắt auto-mode (FR-GD6-06).
export interface QueueItem {
  id: string; // queue_ + timestamp
  messageId: string; // email nguồn (join khi duyệt — UC-07)
  draft: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// Alias TA note v1.1 — giữ QueueItem canonical (§7.2).
export type PendingAutoDraft = QueueItem & { status: "pending" };
