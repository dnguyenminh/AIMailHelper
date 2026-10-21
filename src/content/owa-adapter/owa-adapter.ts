// src/content/owa-adapter/owa-adapter.ts — «facade» API DUY NHẤT tới DOM OWA (TDD §3.1, §4.2).
// Biên DOM duy nhất (§1.4 #2): modules/components chỉ thấy facade; chuỗi locate theo §5.3:
// SemanticLocator (T1→cache→T2) → T3 VisionFallback CHỈ khi T1+T2 fail (BR-12; BR-03 opt-in
// kiểm tra kép tại vision-fallback). FunctionKey/LocatorStrategy/SelectorTier canonical selectors.ts.
import type { EmailData, CancelSignal } from "../../shared/types";
import { insertDraft, openReplyBox } from "./actions";
import type { ActionsDeps, InsertDecision, InsertOutcome } from "./actions";
import { readEditableText, writeEditableText } from "./editable";
import { detectView } from "./detector";
import type { OwaViewInfo } from "./detector";
import { readEmail } from "./reader";
import { SelectorTier } from "./selectors";
import type { FunctionKey, LocatorStrategy } from "./selectors";
import { collectInboxItemsDeep as collectItemsDeep } from "./deep-triage";
import { findItemElement } from "./triage";
import type { InboxItem } from "./triage";
import { VisionFallback } from "./vision-fallback";
import type { VisionLocator } from "./vision-fallback";

export type { FunctionKey, LocatorStrategy } from "./selectors";
export type { InsertDecision, InsertOutcome } from "./actions";
export type { InboxItem } from "./triage";
export { SelectorTier };

// UAT-2: TẮT toolbar injection cho đến khi OWA-DOM-SPIKE.md xác minh — chèn DOM node vào
// container React của OWA có thể phá layout trang (cùng lớp bug toolbar injection — fix 2).
// Nút "AI phân tích" VẪN dùng được trong panel (panel-only mode — quyết định GĐ3 giữ nguyên).
function injectToolbarButton(_onClick: () => void): HTMLElement | null {
  return null; // spike-pending: không mutate DOM của OWA
}

export class OwaAdapter {
  private readonly chain: LocatorStrategy;
  private readonly vision: VisionLocator | null;

  // Mặc định: SemanticLocator (T1→cache→T2) + VisionFallback T3 (tự opt-out khi vision tắt — BR-03).
  // Test inject tiers/vision thay thế; vision = null → tắt hẳn T3 (GĐ5 triage không cần).
  constructor(tiers: readonly LocatorStrategy[] = [], vision: VisionLocator | null = new VisionFallback()) {
    this.chain = tiers[0] ?? new SelectorTier();
    this.vision = vision;
  }

  // §5.3 — chuỗi locator đầy đủ: chain trước, T3 sau khi T1+T2 fail; fail hoàn toàn → null (ERR-06).
  // allowVision là per-call opt-in (BR-03 điều kiện 1 — mặc định FALSE → analyze KHÔNG bao giờ
  // tạo ảnh; caller chủ động truyền true ở luồng user-initiated: chèn draft/mở reply box).
  async locate(functionKey: FunctionKey, question = "", allowVision = false): Promise<Element | null> {
    const element = await this.chain.resolve(functionKey, question);
    if (element) return element;
    return this.vision !== null ? this.vision.resolve(functionKey, question, allowVision) : null;
  }

  // §3.1.4 — detector: structural probe reading-pane/popout/conversation/unknown (FR-GD3-01).
  detectView(): OwaViewInfo {
    return detectView();
  }

  // §3.1.4 — reader: EmailData qua locate; gate BR-14 nằm trong reader (GĐ3 Done #2).
  // signal (uat58): start mới/cancel() flip → nhánh Copilot tự hủy (không pipeline mồ côi).
  async readEmail(signal?: CancelSignal): Promise<EmailData> {
    return readEmail((key, question) => this.locate(key, question), this.detectView(), signal);
  }

  // FR-GD3-04 — inject nút "AI phân tích" vào toolbar email QUA adapter (components không tự bấm DOM).
  injectAnalyzeButton(_onClick: () => void): HTMLElement | null {
    return injectToolbarButton(_onClick);
  }

  // UC-02 AF-1 — compose chưa mở → mở reply box qua chuỗi locator (actions.ts tự verify SR-08).
  async openReplyBox(): Promise<boolean> {
    return openReplyBox(this.actionDeps());
  }

  // UC-02 bước 8 — FR-GD4-03; outcome {inserted | needs-confirm | blocked-empty | compose-not-found | write-failed}.
  async insertDraft(draft: string, decision?: InsertDecision): Promise<InsertOutcome> {
    return insertDraft(draft, decision, this.actionDeps());
  }

  // UAT — cuộn đến mail trong danh sách (KHÔNG mở mail, KHÔNG đổi trạng thái đã đọc).
  // scrollIntoView chỉ đổi scroll position — không tương tác React OWA.
  scrollToItem(messageId: string): boolean {
    const element = findItemElement(messageId);
    if (element === null || !element.isConnected) return false;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  // UAT — MỞ mail (click) → Outlook đánh dấu "đã đọc". Người dùng chủ động chọn.
  openItem(messageId: string): boolean {
    const element = findItemElement(messageId);
    if (element === null || !element.isConnected) return false;
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }

  // FR-GD5-03 — badge màu trên list item. UAT-3: TẮT DOM injection — appendChild vào
  // row do React của OWA quản lý làm VỠ layout trang (cùng lớp bug toolbar injection — fix 2).
  // Điểm số vẫn hiển thị trong panel Digest (DigestView — không đụng DOM OWA).
  // UAT-3 — fail-safe: KHÔNG mutate DOM của OWA. Trả false (caller log, không chặn batch).
  attachBadge(messageId: string, score: number): boolean {
    void messageId;
    void score;
    return false; // spike-pending: badge hiển thị trong Digest panel thay vì trên list row
  }

  // §3.1.6 triage (GĐ5 — BR-07): items ĐANG HIỂN THỊ; thiếu message-id → bỏ qua + log (FR-GD5-06).
  // locate KHÔNG opt-in vision (allowVision mặc định false — triage không cần T3, BR-03).
  collectInboxItemsDeep(): Promise<InboxItem[]> {
    return collectItemsDeep((key, question) => this.locate(key, question));
  }

  // Chuỗi locate ĐẦY ĐỦ (T1→T2→T3) đưa vào actions — BR-12 giữ nguyên ở mọi tầng; allowVision=true
  // vì đây là hành động người dùng chủ động (per-call opt-in BR-03 — config check nằm ở T3/SW).
  private actionDeps(): ActionsDeps {
    return {
      locate: (functionKey, question) => this.locate(functionKey, question, true),
      writeText: writeEditableText,
      readText: readEditableText
    };
  }
}

// Instance dùng chung content script
export const owaAdapter = new OwaAdapter();