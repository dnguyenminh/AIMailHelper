// src/content/owa-adapter/detector.ts — nhận diện chế độ OWA (TDD §3.1.4; FR-GD3-01).
// Structural probe THÔNG SÚY — KHÔNG đoán theo text (§3.1.4): role/aria-label functional/data-*.
export type DetectedView = "reading-pane" | "popout" | "conversation" | "unknown";

export interface OwaViewInfo {
  view: DetectedView;
  container: Element | null; // container phục vụ inject/reader (toolbar, message body)
}

const MESSAGE_PROBE = '[aria-label*="Message" i], [data-conversation]';
const CONVERSATION_PROBE = "[data-conversation]";
// LƯU Ý: mỗi alternative phải tự scope `[role=…]` — nối chuỗi với probe chứa "," sẽ thoát scope.
const DIALOG_PROBE = '[role="dialog"] [aria-label*="Message" i], [role="dialog"] [data-conversation]';
const MAIN_PROBE = '[role="main"] [aria-label*="Message" i], [role="main"] [data-conversation]';

// Ưu tiên: popout (dialog) → conversation (data-conversation / nhiều message block) → reading-pane
// (message trong role=main hoặc lẻ) → unknown (caller quyết EF-3 UC-01).
export function detectView(root: ParentNode = document): OwaViewInfo {
  const dialogMessage = root.querySelector(DIALOG_PROBE);
  if (dialogMessage) {
    return { view: "popout", container: dialogMessage.closest('[role="dialog"]') ?? dialogMessage };
  }
  const conversation = findConversation(root);
  if (conversation) {
    return { view: "conversation", container: conversation };
  }
  const mainMessage = root.querySelector(MAIN_PROBE);
  if (mainMessage) {
    return { view: "reading-pane", container: mainMessage };
  }
  const loose = root.querySelector(MESSAGE_PROBE);
  if (loose) {
    return { view: "reading-pane", container: loose }; // chế độ đọc bật riêng — vẫn structural match
  }
  return { view: "unknown", container: null };
}

// Conversation: probe data-conversation trực tiếp, hoặc >1 message block NGOÀI CÙNG trong container
// (loại phần tử lồng nhau cùng khớp probe — vd container "Message body" chứa body "Message body").
function findConversation(root: ParentNode): Element | null {
  const marked = root.querySelector(CONVERSATION_PROBE);
  if (marked) return marked;
  const blocks = outermost(root, MESSAGE_PROBE);
  if (blocks.length > 1) return blocks[0]?.parentElement ?? null;
  return null;
}

// Chỉ giữ element ngoài cùng — inner khớp probe nhưng nằm trong element khác cũng khớp → bỏ.
function outermost(root: ParentNode, probe: string): Element[] {
  const all = Array.from(root.querySelectorAll(probe));
  return all.filter((element) => !all.some((other) => other !== element && other.contains(element)));
}
