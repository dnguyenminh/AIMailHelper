// src/content/modules/automode-approve.ts — UC-07 approve/reject orchestration (TDD §5.5 bước 4).
// EF-5: so khớp messageId email ĐANG MỞ trước khi chèn qua actions.insertDraft (GĐ4) — email
// nguồn không còn mở → cảnh báo + GIỮ pending. EF-2: chèn thất bại → item VỀ pending + ERR-09
// (item chỉ rời pending SAU KHI chèn thành công — mọi nhánh lỗi tự nhiên giữ pending). AF-5:
// Approve all tuần tự theo thứ tự hàng chờ, item lỗi KHÔNG nuốt — cuối báo tổng kết (N/M).
// Reject → loại khỏi hàng chờ, không chèn. KHÔNG tồn tại đường code nào tự Send (BR-01).
import type { QueueItem } from "../../shared/types";
import type { InsertDecision, InsertOutcome } from "../owa-adapter/actions";
import type { ApproveAllResult, ApproveOutcome, ApproveSummary, AutoModeDeps, AutoModeState } from "./automode-types";

export interface AutoQueueHost {
  deps: Pick<AutoModeDeps, "listQueue" | "updateStatus" | "insertDraft" | "currentMessageId">;
  patch: (patch: Partial<AutoModeState>) => void;
  refresh: () => Promise<void>;
}

export const byCreated = (a: QueueItem, b: QueueItem): number => a.createdAt.localeCompare(b.createdAt);

export class AutoModeQueue {
  constructor(private readonly host: AutoQueueHost) {}

  // UC-07 bước 4-5 — duyệt 1 item pending. decision khác undefined → bỏ qua EF-5 (panel đã
  // hỏi replace/append ở lần needs-confirm — người dùng đã quyết, KHÔNG kiểm lại).
  async approve(id: string, decision?: InsertDecision): Promise<ApproveOutcome> {
    const items = await this.host.deps.listQueue();
    const item = items.find((entry) => entry.id === id && entry.status === "pending");
    if (!item) return { kind: "not-found" };
    if (item.draft.trim().length === 0) return this.insertFailed(id); // BR-10 — draft rỗng vô hiệu chèn
    if (decision === undefined) {
      const currentId = await this.host.deps.currentMessageId();
      if (currentId === null || currentId !== item.messageId) {
        this.host.patch({ mismatchId: item.messageId }); // EF-5 — cảnh báo + GIỮ pending
        return { kind: "mismatch" };
      }
    }
    let outcome: InsertOutcome;
    try {
      outcome = await this.host.deps.insertDraft(item.draft, decision);
    } catch {
      return this.insertFailed(id); // EF-2 — exception KHÔNG nuốt (ERR-09)
    }
    if (outcome.kind === "needs-confirm") return { kind: "needs-confirm", existing: outcome.existing }; // AF-5 actions
    if (outcome.kind !== "inserted") return this.insertFailed(id); // compose-not-found/write-failed
    await this.host.deps.updateStatus(id, "approved");
    console.info("[AIMH][automode] pending→approved: " + id); // §8.9 audit
    this.host.patch({ mismatchId: null, lastError: null });
    await this.host.refresh();
    return { kind: "approved" };
  }

  // AF-1/AF-5 UC-07 — chèn lần lượt theo thứ tự hàng chờ; needs-confirm (compose có nội dung
  // sẵn) → dừng, panel hỏi replace/append rồi gọi lại VỚI decision (áp cho phần còn lại).
  async approveAll(decision?: InsertDecision): Promise<ApproveAllResult> {
    const items = (await this.host.deps.listQueue()).filter((entry) => entry.status === "pending").sort(byCreated);
    const summary: ApproveSummary = { approved: 0, failed: 0, failedIds: [] };
    for (const item of items) {
      const outcome = await this.approve(item.id, decision);
      if (outcome.kind === "approved") summary.approved += 1;
      else if (outcome.kind === "needs-confirm") return { kind: "needs-confirm", existing: outcome.existing };
      else {
        summary.failed += 1;
        summary.failedIds.push(item.id); // mismatch/ERR-09/not-found — báo danh sách lỗi (AF-5)
      }
    }
    this.host.patch({ summary: summary });
    return { kind: "summary", summary: summary };
  }

  // AF-2 UC-07 — Reject → loại khỏi hàng chờ, không chèn (FR-GD6-04).
  async reject(id: string): Promise<ApproveOutcome> {
    const updated = await this.host.deps.updateStatus(id, "rejected");
    if (updated === null) return { kind: "not-found" };
    console.info("[AIMH][automode] pending→rejected: " + id); // §8.9 audit
    await this.host.refresh();
    return { kind: "rejected" };
  }

  // Panel QueueView — pending sort theo createdAt (thứ tự hàng chờ, AF-1 UC-07).
  async listPending(): Promise<QueueItem[]> {
    const items = await this.host.deps.listQueue();
    return items.filter((item) => item.status === "pending").sort(byCreated);
  }

  private insertFailed(id: string): ApproveOutcome {
    console.warn("[AIMH][automode] ERR-09: chèn thất bại — item giữ pending: " + id); // EF-2
    this.host.patch({ lastError: { code: "ERR-09", i18nKey: "errors.insertFailed" }, mismatchId: null });
    return { kind: "insert-failed", code: "ERR-09" };
  }
}
