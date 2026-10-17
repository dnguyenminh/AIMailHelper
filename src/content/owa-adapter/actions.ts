// src/content/owa-adapter/actions.ts — API DUY NHẤT cho hành động compose (TDD §3.1.5; UC-02).
// BR-01 (no-Send guarantee, §8.5): API surface CHỈ {openReplyBox, insertDraft} — audit TC-121 chốt;
// KHÔNG tồn tại đường code nào điều khiển nút gửi của OWA; selectors nút gửi chỉ phục vụ diagnose
// (nằm riêng ở selectors.ts — UC-09).
// AF-1: compose chưa mở → openReplyBox trước; AF-5: compose có nội dung → needs-confirm kèm existing
// (KHÔNG ghi đè im lặng — panel hỏi replace/append); BR-10: draft rỗng → blocked-empty.
import type { WriteMode } from "./editable";
import type { FunctionKey } from "./selectors";

export type InsertDecision = "replace" | "append";

export type InsertOutcome =
  | { kind: "inserted" }
  | { kind: "needs-confirm"; existing: string } // AF-5 — compose đã có nội dung sẵn
  | { kind: "blocked-empty" } // BR-10 — draft rỗng, vô hiệu chèn
  | { kind: "compose-not-found" } // EF-1/EF-2 — không định vị được compose (caller → ERR-09)
  | { kind: "write-failed" }; // ERR-09 — compose thấy nhưng điền thất bại

// DI seam (§4.3) — locate là chuỗi ĐẦY ĐỦ T1→T2→T3 (per-call opt-in do OwaAdapter quyết).
export interface ActionsDeps {
  locate: (functionKey: FunctionKey, question: string) => Promise<Element | null>;
  readText: (el: Element) => string;
  writeText: (el: Element, text: string, mode: WriteMode) => boolean;
}

const COMPOSE_QUESTION = "khung soạn thảo trả lời (compose box)";

// AF-1 UC-02 — mở reply box: locate reply-button (BR-12 chain) → dispatch sự kiện nhấn.
// CHỈ nút Reply — không bao giờ trỏ tới nút gửi (BR-01; verifyElement SR-08 chặn sai phần tử).
export async function openReplyBox(deps: ActionsDeps): Promise<boolean> {
  const button = await deps.locate("reply-button", "nút Reply để mở khung soạn thảo");
  if (!button) return false;
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}

// UC-02 bước 8 — FR-GD4-03: định vị compose → gate BR-10/AF-5 → điền draft qua editable.ts.
// UAT (15/10): KHÔNG TỰ ĐỘNG mở reply box — người dùng phải tự bấm Reply trước. Tự bấm Reply
// qua dispatchEvent gây tạo reply email mới ngoài ý muốn (bug UAT). Compose chưa mở → trả
// compose-not-found, panel hiển thị hướng dẫn "bấm Reply trước".
export async function insertDraft(
  draft: string,
  decision: InsertDecision | undefined,
  deps: ActionsDeps
): Promise<InsertOutcome> {
  if (draft.trim().length === 0) return { kind: "blocked-empty" }; // BR-10 — chặn trước DOM
  const box = await deps.locate("compose-box", COMPOSE_QUESTION);
  if (!box) return { kind: "compose-not-found" }; // KHÔNG auto-open — user bấm Reply trước
  const existing = deps.readText(box);
  if (existing.trim().length > 0 && decision === undefined) {
    return { kind: "needs-confirm", existing: existing }; // AF-5 — hỏi xác nhận ở panel
  }
  return deps.writeText(box, draft, decision ?? "replace")
    ? { kind: "inserted" }
    : { kind: "write-failed" };
}
