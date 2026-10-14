// src/content/modules/analyze.ts — orchestrate UC-01 (TDD §3.7): readEmail → Port "analyze" stream →
// parse 6.6f fail-closed (validateAnalysisResult caps §8.11 L3) → state cho Panel render.
// AF-4: request cũ hủy khi bắt đầu phân tích email mới; streaming render gom rAF ≤ 1 render/frame.
import { toAnalysisResult } from "../../shared/analysis";
import { AppError } from "../../shared/errors";
import type { PortEvent } from "../../shared/messaging";
import { PortClient } from "../../shared/port-client";
import type { StreamHandle } from "../../shared/port-client";
import type { AnalysisResult, EmailData } from "../../shared/types";
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
}

export interface AnalyzeDeps {
  readEmail: () => Promise<EmailData>;
  request: (kind: "analyze", payload: { email: EmailData }, onEvent: (event: PortEvent) => void) => StreamHandle;
  onState: (state: AnalysisUiState) => void;
}

const IDLE: AnalysisUiState = { status: "idle", raw: "", result: null, error: null };

// rAF không có trong mọi env (jsdom không bật pretendToBeVisual) — fallback timer cùng ngữ nghĩa.
const nextFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (callback) => requestAnimationFrame(() => callback())
    : (callback) => setTimeout(callback, 16) as unknown as number;
const cancelFrame = (id: number): void => {
  if (typeof requestAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
};

export class AnalyzeController {
  private handle: StreamHandle | null = null;
  private state: AnalysisUiState = IDLE;
  private raw = "";
  private frameId = 0;
  private email: EmailData | null = null; // GĐ4 — email nguồn cho UC-02 (panel đọc qua getEmail)

  constructor(private readonly deps: AnalyzeDeps) {}

  // UC-01 Main Flow — AF-4: start mới ⇒ cancel stream cũ (đổi email giữa chừng).
  async start(): Promise<void> {
    this.cancelStream();
    this.setState({ status: "reading", raw: "", result: null, error: null });
    let email: EmailData;
    try {
      email = await this.deps.readEmail(); // ERR-10 (BR-14) / ERR-06 ném từ reader — EF-1/EF-3
    } catch (error) {
      this.email = null;
      this.setState({ status: "error", raw: "", result: null, error: toAnalysisError(error) });
      return;
    }
    this.email = email;
    this.raw = "";
    this.setState({ status: "streaming", raw: "", result: null, error: null });
    this.handle = this.deps.request("analyze", { email: email }, (event) => this.onEvent(event));
  }

  cancel(): void {
    this.cancelStream();
    this.setState(IDLE);
  }

  private cancelStream(): void {
    this.handle?.cancel();
    this.handle = null;
    if (this.frameId) {
      cancelFrame(this.frameId);
      this.frameId = 0;
    }
  }

  private onEvent(event: PortEvent): void {
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
    readEmail: () => owaAdapter.readEmail(),
    request: (kind, payload, onEvent) => client.request(kind, payload, onEvent),
    onState: onState
  });
}
