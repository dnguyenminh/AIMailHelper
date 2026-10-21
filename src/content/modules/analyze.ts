// src/content/modules/analyze.ts — UC-01 (TDD §3.7): readEmail → Port "analyze" → parse 6.6f
// fail-closed → state cho Panel. AF-4 + uat58: run mới hủy run cũ; watchdog chống treo streaming.
import { toAnalysisResult } from "../../shared/analysis";
import { AppError } from "../../shared/errors";
import type { PortEvent } from "../../shared/messaging";
import { PortClient } from "../../shared/port-client";
import type { StreamHandle } from "../../shared/port-client";
import type { AnalysisResult, EmailData, CancelSignal } from "../../shared/types";
import type { MdNode } from "../../shared/copilot-format";
import { owaAdapter } from "../owa-adapter/owa-adapter";

export interface AnalysisError {
  code: string;
  i18nKey: string;
  params?: Record<string, string>;
  retryable: boolean;
  ef6Raw?: string; // EF-6 — raw model output hiển thị kèm cảnh báo (UC-01 EF-6)
}

export interface AnalysisUiState {
  status: "idle" | "reading" | "streaming" | "done" | "error";
  raw: string;
  result: AnalysisResult | null;
  error: AnalysisError | null;
  copilot?: boolean; // GĐ-B — raw là lời Copilot TRẢ VERBATIM (panel hiển thị nguyên văn, result=null)
  rawHtml?: MdNode[]; // 21/10 uat60 — cây sanitized từ outerHTML Copilot (render React giữ format)
}

export interface AnalyzeDeps {
  readEmail: (signal?: CancelSignal) => Promise<EmailData>;
  request: (kind: "analyze", payload: { email: EmailData }, onEvent: (event: PortEvent) => void) => StreamHandle;
  onState: (state: AnalysisUiState) => void;
}

const IDLE: AnalysisUiState = { status: "idle", raw: "", result: null, error: null };

// rAF không có trong mọi env (jsdom không bật pretendToBeVisual) — fallback timer.
const nextFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (callback) => requestAnimationFrame(() => callback())
    : (callback) => setTimeout(callback, 16) as unknown as number;
const cancelFrame = (id: number): void => {
  if (typeof requestAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
};

const WATCHDOG_MS = 120_000; // uat58 — LLM first-chunk thường <30s; 120s = biên an toàn

export class AnalyzeController {
  private handle: StreamHandle | null = null;
  private state: AnalysisUiState = IDLE;
  private raw = "";
  private frameId = 0;
  private email: EmailData | null = null; // GĐ4 — email nguồn cho UC-02 (panel đọc qua getEmail)
  private runSignal: CancelSignal = { cancelled: false }; // uat58 — hủy pipeline mồ côi
  private watchdogId = 0; // uat58 — stream câm tuyệt đối → ERR-07 (chống treo "Đang phân tích…")

  constructor(private readonly deps: AnalyzeDeps) {}
  // UC-01 Main Flow — AF-4: start mới ⇒ cancel run cũ. Run cũ bị flip cancelled → poll
  // Copilot tự chết + setState bị chặn (uat58: hết 2 instance giành chrome.debugger).
  async start(): Promise<void> {
    this.runSignal.cancelled = true;
    const signal: CancelSignal = { cancelled: false };
    this.runSignal = signal;
    this.cancelStream();
    this.setState({ status: "reading", raw: "", result: null, error: null });
    let email: EmailData;
    try {
      email = await this.deps.readEmail(signal); // ERR-10 (BR-14) / ERR-06 ném từ reader — EF-1/EF-3
    } catch (error) {
      this.email = null;
      this.setState({ status: "error", raw: "", result: null, error: toAnalysisError(error) });
      return;
    }
    if (signal.cancelled) return; // bị thay thế giữa lúc đọc — run mới đang owns state
    this.email = email;
    // GĐ-B 20/10 — copilotSummary → NGUYÊN VĂN (schema cap ≤1000 ký tự §8.11 → đi qua raw).
    if (typeof email.copilotSummary === "string" && email.copilotSummary.trim().length > 0) {
      this.setState({ status: "done", raw: email.copilotSummary, result: null, error: null, copilot: true, rawHtml: email.copilotHtml });
      return;
    }
    this.raw = "";
    this.setState({ status: "streaming", raw: "", result: null, error: null });
    this.handle = this.deps.request("analyze", { email: email }, (event) => this.onEvent(event));
    this.armWatchdog();
  }

  // uat58 — watchdog: stream câm (port mất/SW chết/mạng treo) → ERR-07 sau 120s; panel
  // không đứng ở "Đang phân tích…" vĩnh viễn. Copilot path không stream — không hụ.
  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdogId = setTimeout(() => {
      if (this.state.status !== "streaming") return;
      this.onEvent({ type: "error", requestId: "watchdog", code: "ERR-07", i18nKey: "errors.timeout", retryable: true });
    }, WATCHDOG_MS) as unknown as number;
  }

  private clearWatchdog(): void {
    if (this.watchdogId !== 0) {
      clearTimeout(this.watchdogId);
      this.watchdogId = 0;
    }
  }

  cancel(): void {
    this.runSignal.cancelled = true;
    this.cancelStream();
    this.clearWatchdog();
    this.state = IDLE; // GÁN TRỰC TIẾP — bypass guard (cancel có quyền set IDLE)
    this.deps.onState(IDLE);
  }

  private cancelStream(): void {
    this.handle?.cancel();
    this.handle = null;
    if (this.frameId) {
      cancelFrame(this.frameId);
      this.frameId = 0;
    }
    this.clearWatchdog();
  }

  private onEvent(event: PortEvent): void {
    this.clearWatchdog(); // tín hiệu sống — hủy watchdog
    if (event.type === "chunk") {
      this.raw += event.delta;
      this.scheduleRender(); // gom nhiều chunk trong 1 frame — ≤ 1 render/frame (NFR §10)
      return;
    }
    if (event.type === "done") {
      this.finish();
      return;
    }
    if (event.type === "error") {
      this.setState({
        status: "error",
        raw: this.raw, // EF-4 — giữ phần đã nhận
        result: null,
        error: { code: event.code, i18nKey: event.i18nKey, params: event.params, retryable: event.retryable }
      });
    }
  }

  private scheduleRender(): void {
    if (this.frameId) return;
    this.frameId = nextFrame(() => {
      this.frameId = 0;
      this.setState({ status: "streaming", raw: this.raw, result: null, error: null });
    });
  }

  // FSD 6.6f — done → parse fail-closed; không parse được → EF-6 (raw + cảnh báo, KHÔNG tự retry).
  private finish(): void {
    const result = toAnalysisResult(this.raw);
    if (result) {
      this.setState({ status: "done", raw: this.raw, result: result, error: null });
      return;
    }
    this.setState({
      status: "error",
      raw: this.raw,
      result: null,
      error: { code: "EF-6", i18nKey: "panel.analyze.parseFailed", retryable: true, ef6Raw: this.raw }
    });
  }

  private setState(state: AnalysisUiState): void {
    if (this.runSignal.cancelled) return; // run mồ côi KHÔNG được đè state của run mới (uat58)
    this.state = state;
    this.deps.onState(state);
  }

  getState(): AnalysisUiState {
    return this.state;
  }

  // GĐ4 (UC-02) — EmailData của lần analyze gần nhất; null khi chưa analyze/đọc lỗi.
  getEmail(): EmailData | null {
    return this.email;
  }
}

export function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof AppError) {
    return { code: error.code, i18nKey: error.i18nKey, params: error.params, retryable: error.retryable };
  }
  console.error("[AIMH][analyze] unexpected error:", error); // KHÔNG log payload email (BR-08)
  return { code: "ERR-15", i18nKey: "errors.badRequest", retryable: false };
}

// Deps mặc định cho Panel — PortClient singleton của module (heartbeat + reconnect sẵn của GĐ2).
export function createAnalyzeController(onState: (state: AnalysisUiState) => void): AnalyzeController {
  const client = new PortClient();
  return new AnalyzeController({
    readEmail: (signal) => owaAdapter.readEmail(signal),
    request: (kind, payload, onEvent) => client.request(kind, payload, onEvent),
    onState: onState
  });
}
