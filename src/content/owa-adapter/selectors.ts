// src/content/owa-adapter/selectors.ts — Tầng 1 multi-strategy selector chain (TDD §3.1.1; FR-GD1-08).
// Chỉ dùng attribute bền vững của OWA (role, aria-label EN/VN, data-*) — KHÔNG class hash (gãy khi rebuild CSS).
// Lưu ý spike (§15.2 #3): chain dựa trên pattern OWA phổ biến — bắt buộc verify GĐ3 trên cả 2 domain.
// FunctionKey + SelectorTier (T1) đặt Ở ĐÂY để tránh vòng import owa-adapter ⇄ semantic-locator.
export type FunctionKey =
  | "reading-pane"
  | "message-toolbar"
  | "reply-button"
  | "compose-box"
  | "inbox-list"
  | "inbox-item";

// «interface» Strategy (§4.3) — impl: SelectorTier (T1) · SemanticLocator (T2, GĐ3) · VisionFallback (T3, GĐ4).
export interface LocatorStrategy {
  resolve(functionKey: FunctionKey, question: string): Promise<Element | null>;
}

export type SelectorChain = readonly string[];

export const SELECTOR_CHAINS: Record<FunctionKey, SelectorChain> = {
  // [role=main] [aria-label*=Message i] → [data-conversation] → (structural probe — GĐ3 detector)
  // UAT spike 15/10 (outlook.cloud.microsoft): aria-label*=Message trúng element sai (ribbon) —
  // giữ đầu chain cho OWA cũ, thêm iframe container (thân email nằm trong iframe cùng origin).
  "reading-pane": [
    '[role="main"] [aria-label*="Message" i]',
    "[data-conversation]",
    '[role="main"] iframe'
  ],
  // UAT spike: [role=toolbar] trúng RIBBON (Home tab) trên OWA mới — KHÔNG phải message toolbar.
  // Message toolbar thật nằm cạnh pane header (sau khi fix reader nâng container).
  "message-toolbar": ['[role="main"] [role="toolbar"]', '[role="toolbar"]'],
  // aria-label EN "Reply" (loại "Reply all") → label VN "Trả lời"
  "reply-button": [
    '[aria-label*="Reply" i]:not([aria-label*="all" i])',
    '[aria-label*="Trả lời" i]:not([aria-label*="Tất cả" i])'
  ],
  // textbox multiline → aria-label chứa "Compose" / "trả lời"
  "compose-box": [
    '[role="textbox"][aria-multiline="true"]',
    '[aria-label*="Compose" i][role="textbox"]',
    '[aria-label*="trả lời" i][role="textbox"]'
  ],
  // list chứa listitem con → container scroll chính (virtualized — chỉ item trong DOM, AF-5 UC-03)
  // UAT spike 15/10 (outlook.cloud.microsoft): danh sách email = listbox chứa option (mỗi option
  // = 1 email với checkbox + Flag); cây thư mục = treeitem. Giữ [role=list] cho OWA cũ.
  "inbox-list": ['[role="list"]', '[role="main"] [role="listbox"]', '[role="listbox"]'],
  "inbox-item": ['[role="listitem"]', '[role="main"] [role="option"]', '[role="option"]', '[role="treeitem"]']
};

// BR-01 / SR-14 invariant: send-button KHÔNG thuộc FunctionKey — CHỈ phục vụ diagnose đối chiếu
// "có thấy nút Send không" (UC-09). Không tồn tại API action nào trỏ tới — không đường kích hoạt nào.
export const SEND_BUTTON_SELECTORS: SelectorChain = ['[aria-label*="Send" i]', '[aria-label*="Gửi" i]'];

// Thử tuần tự từng candidate, trả element đầu tiên khớp — <1ms, 0 token (NFR §10).
export function resolveBySelectors(functionKey: FunctionKey, root: ParentNode = document): Element | null {
  for (const selector of SELECTOR_CHAINS[functionKey]) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

// T1 fast-path — <1ms, 0 token (NFR §10). GĐ1 Done (3): chain trả element trên 3 domain (spike GĐ3).
export class SelectorTier implements LocatorStrategy {
  async resolve(functionKey: FunctionKey, _question: string): Promise<Element | null> {
    return resolveBySelectors(functionKey);
  }
}
