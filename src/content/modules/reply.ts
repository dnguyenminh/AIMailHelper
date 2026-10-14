// src/content/modules/reply.ts — UC-02 orchestration (TDD §3.7; FR-GD4-01..03, 07; FSD 6.3).
// Panel bấm "Soạn trả lời" → Port "reply" stream → preview draft (rAF-gom ≤1 render/frame) →
// bấm "Chèn vào Reply" → EF-5 so khớp messageId email đang mở → actions.insertDraft (KHÔNG tự
// kích hoạt nút gửi OWA — BR-01). ERR-09/EF-2 → giữ draft trong preview để copy tay (FR-GD4-07).
import type { InsertDecision, InsertOutcome } from "../owa-adapter/actions";
import type { PortEvent } from "../../shared/messaging";
import { PortClient } from "../../shared/port-client";
import type { StreamHandle } from "../../shared/port-client";
import type { EmailData, ReplyLanguage, ReplyTone } from "../../shared/types";

export interface ReplyOptions {
  tone: ReplyTone;
  language: ReplyLanguage;
  extraInstructions: string;
}

export interface ReplyError {
  code: string;
  i18nKey: string;
  params?: Record<string, string>;
  retryable: boolean;
}

export interface ReplyUiState {
  status: "idle" | "streaming" | "ready" | "error";
  draft: string;
  error: ReplyError | null;
  mismatch: boolean; // EF-5 — email nguồn đổi giữa lúc soạn → KHÔNG chèn tự động
}

export type ReplyInsertDecision = InsertDecision;

export interface ReplyDeps {
  request: (
    kind: "reply",
    payload: { email: EmailData; tone: ReplyTone; language: ReplyLanguage; extraInstructions: string },
    onEvent: (event: PortEvent) => void
  ) => StreamHandle;
  insertDraft: (draft: string, decision?: InsertDecision) => Promise<InsertOutcome>;
  currentMessageId: () => Promise<string | null>; // email ĐANG MỞ — so khớp EF-5
  onState: (state: ReplyUiState) => void;
}

export const IDLE_REPLY: ReplyUiState = { status: "idle", draft: "", error: null, mismatch: false };

// rAF không có trong mọi env — cùng fallback timer với analyze.ts (GĐ3).
const nextFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (callback) => requestAnimationFrame(() => callback())
    : (callback) => setTimeout(callback, 16) as unknown as number;
const cancelFrame = (id: number): void => {
  if (typeof requestAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
};

export class ReplyController {
  private handle: StreamHandle | null = null;
  private state: ReplyUiState = IDLE_REPLY;
  private raw = "";
  private frameId = 0;
  private sourceEmail: EmailData | null = null;
  private options: ReplyOptions | null = null;

  constructor(private readonly deps: ReplyDeps) {}

  // UC-02 bước 3-6 — stream draft; AF-3: gọi lại với tham số mới → stream cũ bị hủy.
  start(email: EmailData, options: ReplyOptions): void {
    this.cancelStream();
    this.sourceEmail = email;
    this.options = options;
    this.raw = "";
    this.setState({ status: "streaming", draft: "", error: null, mismatch: false });
    this.handle = this.deps.request("reply", { email: email, tone: options.tone, language: options.language, extraInstructions: options.extraInstructions }, (event) => this.onEvent(event));
  }

  // EF-3 — "Thử lại" sinh lại từ đầu với email + tham số cũ.
  retry(): void {
    if (this.sourceEmail && this.options) this.start(this.sourceEmail, this.options);
  }

  cancel(): void {
    this.cancelStream();
    this.setState(IDLE_REPLY);
  }

  // UC-02 bước 7-8 + FSD 6.3 — EF-5 so khớp TRƯỚC khi chèn; không khớp → chỉ cảnh báo.
  // ignoreMismatch: luồng "Vẫn chèn" (EF-5) — người dùng đã quyết, KHÔNG kiểm lại (tránh loop).
  async insert(
    currentMessageIdHint?: string,
    decision?: InsertDecision,
    ignoreMismatch = false
  ): Promise<InsertOutcome | { kind: "mismatch" }> {
    if (this.state.draft.trim().length === 0) return { kind: "blocked-empty" }; // BR-10 lớp 2
    if (!this.sourceEmail) return { kind: "blocked-empty" };
    if (decision === undefined && !ignoreMismatch) {
      const currentId = currentMessageIdHint !== undefined ? currentMessageIdHint : await this.deps.currentMessageId();
      if (currentId === null || currentId !== this.sourceEmail.messageId) {
        this.setState({ ...this.state, mismatch: true }); // EF-5 — KHÔNG chèn tự động
        return { kind: "mismatch" };
      }
    }
    const outcome = await this.deps.insertDraft(this.state.draft, decision);
    if (outcome.kind === "write-failed" || outcome.kind === "compose-not-found") {
      // ERR-09 / EF-1 UC-02 — giữ preview để copy tay (FR-GD4-07) + gợi ý Diagnose
      this.setState({ status: "error", draft: this.state.draft, error: { code: "ERR-09", i18nKey: "errors.insertFailed", retryable: false }, mismatch: false });
    } else {
      this.setState({ ...this.state, mismatch: false });
    }
    return outcome;
  }

  // EF-5 — người dùng chọn "vẫn chèn" sau cảnh báo: bỏ qua so khớp (đã quyết định trước đó).
  insertAnyway(decision?: InsertDecision): Promise<InsertOutcome | { kind: "mismatch" }> {
    return this.insert(undefined, decision, true);
  }

  dismissMismatch(): void {
    this.setState({ ...this.state, mismatch: false });
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
      this.scheduleRender(); // ≤ 1 render/frame (NFR §10)
      return;
    }
    if (event.type === "done") {
      cancelFrame(this.frameId);
      this.frameId = 0;
      this.setState({ status: "ready", draft: this.raw, error: null, mismatch: false }); // BR-10 do nút tự disabled khi rỗng
      return;
    }
    if (event.type === "error") {
      // EF-3/EF-4 — giữ phần draft đã nhận trong preview; retry sinh lại từ đầu
      this.setState({ status: "error", draft: this.raw, error: { code: event.code, i18nKey: event.i18nKey, params: event.params, retryable: event.retryable }, mismatch: false });
    }
  }

  private scheduleRender(): void {
    if (this.frameId) return;
    this.frameId = nextFrame(() => {
      this.frameId = 0;
      this.setState({ status: "streaming", draft: this.raw, error: null, mismatch: false });
    });
  }

  private setState(state: ReplyUiState): void {
    this.state = state;
    this.deps.onState(state);
  }

  getState(): ReplyUiState {
    return this.state;
  }
}

// Deps mặc định cho Panel — PortClient riêng (heartbeat + reconnect GĐ2) + actions qua facade.
export function createReplyController(onState: (state: ReplyUiState) => void): ReplyController {
  const client = new PortClient();
  return new ReplyController({
    request: (kind, payload, onEvent) => client.request(kind, payload, onEvent),
    insertDraft: async (draft, decision) => {
      const { owaAdapter } = await import("../owa-adapter/owa-adapter");
      return owaAdapter.insertDraft(draft, decision);
    },
    currentMessageId: async () => {
      try {
        const { owaAdapter } = await import("../owa-adapter/owa-adapter");
        return (await owaAdapter.readEmail()).messageId;
      } catch {
        return null; // không đọc được email hiện tại → EF-5 coi như không xác minh được
      }
    },
    onState: onState
  });
}
