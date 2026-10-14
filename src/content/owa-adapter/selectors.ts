// src/content/owa-adapter/selectors.ts — Tầng 1 multi-strategy selector chain (TDD §3.1.1; FR-GD1-08).
// Chỉ dùng attribute bền vững của OWA (role, aria-label EN/VN, data-*) — KHÔNG class hash (gãy khi rebuild CSS).
// Lưu ý spike (§15.2 #3): chain dựa trên pattern OWA phổ biến — bắt buộc verify GĐ3 trên cả 2 domain.
import type { FunctionKey } from "./owa-adapter";

export type SelectorChain = readonly string[];

export const SELECTOR_CHAINS: Record<FunctionKey, SelectorChain> = {
  // [role=main] [aria-label*=Message i] → [data-conversation] → (structural probe — GĐ3 detector)
  "reading-pane": ['[role="main"] [aria-label*="Message" i]', "[data-conversation]"],
  // toolbar trong reading pane → mốc tương đối nhóm Reply (structural — GĐ3)
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
  "inbox-list": ['[role="list"]'],
  "inbox-item": ['[role="listitem"]']
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
