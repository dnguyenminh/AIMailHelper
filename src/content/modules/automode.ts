// src/content/modules/automode.ts — GĐ6 auto-mode (TDD §5.5/§3.7; FR-GD6-02..06; BR-02/BR-13).
// sync() = cổng DUY NHẤT vào observer: enabled → MutationObserver (adapter + factory injectable);
// TẮT → disconnect + cancel, KHÔNG fetch tự động, hàng chờ GIỮ NGUYÊN (FR-GD6-06). Email mới →
// analyze (GĐ3) → khớp rule → stream draft "reply" (GĐ4, KHÔNG chèn) → QueueItem pending.
// Approve/reject ủy quyền AutoModeQueue. KHÔNG tồn tại đường code nào tự Send (BR-01).
import { toAnalysisResult } from "../../shared/analysis";
import { AppError } from "../../shared/errors";
import type { PortEvent } from "../../shared/messaging";
import type { StreamHandle } from "../../shared/port-client";
import type { EmailData, QueueItem } from "../../shared/types";
import type { InsertDecision } from "../owa-adapter/actions";
import { AutoModeQueue } from "./automode-approve";
import type { ApproveAllResult, ApproveOutcome, AutoModeDeps, AutoModeState, ObserverFactory } from "./automode-types";
import { IDLE_AUTO } from "./automode-types";
import { matchesAnyRule } from "./automode-rules";

export class AutoModeController {
  private state: AutoModeState = IDLE_AUTO;
  private enabled = false; // BR-02 — false mặc định, chỉ sync() được đổi
  private stopped = false; // panel unmount — sync() sau đó là no-op
  private processing = false;
  private scheduled = false;
  private rerun = false; // mutation đến khi đang xử lý → chạy lại sau
  private processed = new Set<string>(); // dedupe messageId trong phiên (queue check lấp khoảng reload)
  private observer: ReturnType<ObserverFactory> | null = null;
  private handle: StreamHandle | null = null;
  private raw = "";
  private throttleMs = 1000;
  private readonly queue: AutoModeQueue;

  constructor(private readonly deps: AutoModeDeps) {
    this.queue = new AutoModeQueue({
      deps: deps,
      patch: (partial) => this.patch(partial),
      refresh: () => this.refresh()
    });
  }

  // Mount + khi config.automation đổi (storage.onChanged — automode-deps.ts).
  async sync(): Promise<void> {
    if (this.stopped) return;
    const config = await this.deps.getAutomation();
    this.throttleMs = config.throttleMs;
    if (config.enabled && this.observer === null) await this.startObserver();
    if (!config.enabled) this.stopObserver(); // FR-GD6-06 — queue giữ nguyên, không tự hành động
    this.enabled = config.enabled;
    this.patch({ enabled: config.enabled });
    await this.refresh();
  }

  stop(): void {
    this.stopObserver();
    this.stopped = true;
    this.enabled = false;
    this.patch({ enabled: false });
  }

  private async startObserver(): Promise<void> {
    const target = await this.deps.observeTarget(); // inbox-list container QUA adapter (§1.4 #2)
    if (target === null) {
      this.patch({ lastError: { code: "ERR-06", i18nKey: "errors.owaNotFound" } });
      return;
    }
    this.observer = this.deps.observerFactory(() => this.onMutations());
    this.observer.observe(target); // CHỈ đăng ký khi enabled (BR-02 — sync() là cổng duy nhất)
  }

  // TẮT — hủy observer + stream/schedule; KHÔNG đụng queue (FR-GD6-06).
  private stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.handle?.cancel();
    this.handle = null;
    this.scheduled = false;
    this.processing = false;
    this.rerun = false;
  }

  private onMutations(): void {
    if (!this.enabled || this.scheduled) return; // TẮT → không schedule, không fetch (BR-02)
    if (this.processing) {
      this.rerun = true;
      return;
    }
    this.scheduleProcess();
  }

  private scheduleProcess(): void {
    this.scheduled = true;
    this.deps.schedule(() => {
      this.scheduled = false;
      void this.processEmail();
    }, this.throttleMs);
  }

  private async processEmail(): Promise<void> {
    if (this.processing || !this.enabled) return;
    this.processing = true;
    this.patch({ processing: true });
    let messageId: string | null = null;
    try {
      const email = await this.deps.readEmail();
      messageId = email.messageId;
      if (!this.processed.has(email.messageId) && !(await this.isQueued(email.messageId))) {
        this.processed.add(email.messageId);
        await this.analyzeAndDraft(email);
      }
    } catch (error) {
      if (messageId !== null) this.processed.delete(messageId); // EF-1 — mutation sau sẽ thử lại
      this.patch({ lastError: toAutoModeError(error) });
    } finally {
      this.processing = false;
      this.patch({ processing: false });
    }
    if (this.rerun && this.enabled) {
      this.rerun = false;
      this.scheduleProcess();
    }
  }

  // §5.5 bước 3 — analyze → rule → draft (KHÔNG chèn) → queue; rule rỗng dừng ở analyze (BR-13).
  private async analyzeAndDraft(email: EmailData): Promise<void> {
    const analysis = toAnalysisResult(await this.runStream("analyze", { email: email }));
    if (analysis === null) {
      this.processed.delete(email.messageId); // EF-6 fail-closed — cho thử lại, KHÔNG draft
      this.patch({ lastError: { code: "EF-6", i18nKey: "panel.analyze.parseFailed" } });
      return;
    }
    const [config, prompts] = await Promise.all([this.deps.getAutomation(), this.deps.getPrompts()]);
    if (!matchesAnyRule(config.rules, email, analysis)) return; // BR-13 — chỉ analyze
    const draft = await this.runStream("reply", { email: email, tone: prompts.defaultTone, language: prompts.replyLanguage, extraInstructions: "" });
    const item = await this.deps.addToQueue({ messageId: email.messageId, draft: draft });
    if (item === null) {
      this.processed.delete(email.messageId); // QUEUE_MAX 200 (§7.4) — store đã warn ERR-08
      this.patch({ queueFull: true });
      return;
    }
    console.info("[AIMH][automode] auto-draft enqueued: " + item.id); // §8.9 audit
    await this.refresh();
  }

  private runStream(kind: "analyze" | "reply", payload: Parameters<AutoModeDeps["request"]>[1]): Promise<string> {
    this.raw = "";
    return new Promise<string>((resolve, reject) => {
      this.handle = this.deps.request(kind, payload, (event) => this.onStreamEvent(event, resolve, reject));
    });
  }

  private onStreamEvent(event: PortEvent, resolve: (raw: string) => void, reject: (error: unknown) => void): void {
    if (event.type === "chunk") {
      this.raw += event.delta;
      return;
    }
    if (event.type === "done") {
      this.handle = null;
      resolve(this.raw);
      return;
    }
    if (event.type === "error") {
      this.handle = null;
      reject(new AppError(event.code, event.i18nKey, event.params, event.retryable, event.httpStatus));
    }
  }

  private async isQueued(messageId: string): Promise<boolean> {
    const items = await this.deps.listQueue();
    return items.some((item) => item.status === "pending" && item.messageId === messageId);
  }

  async refresh(): Promise<void> {
    try {
      const items = await this.deps.listQueue();
      const pendingCount = items.filter((item) => item.status === "pending").length;
      this.patch({ pendingCount: pendingCount, queueFull: this.state.queueFull && pendingCount >= 200 });
    } catch (error) {
      this.patch({ lastError: toAutoModeError(error) }); // ERR-08 — storage fail
    }
  }

  // UC-07 — ủy quyền cho AutoModeQueue (EF-5/EF-2/AF-5 — xem automode-approve.ts).
  approve(id: string, decision?: InsertDecision): Promise<ApproveOutcome> { return this.queue.approve(id, decision); }
  approveAll(decision?: InsertDecision): Promise<ApproveAllResult> { return this.queue.approveAll(decision); }
  reject(id: string): Promise<ApproveOutcome> { return this.queue.reject(id); }
  listPending(): Promise<QueueItem[]> { return this.queue.listPending(); }

  private patch(partial: Partial<AutoModeState>): void {
    this.state = { ...this.state, ...partial };
    this.deps.onState(this.state);
  }

}function toAutoModeError(error: unknown): { code: string; i18nKey: string; params?: Record<string, string> } {
  if (error instanceof AppError) return { code: error.code, i18nKey: error.i18nKey, params: error.params };
  console.error("[AIMH][automode] unexpected error:", error); // KHÔNG log payload email (BR-08)
  return { code: "ERR-15", i18nKey: "errors.badRequest" };
}
