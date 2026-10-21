// src/content/owa-adapter/reader.ts — đọc EmailData (TDD §3.1.4; FR-GD3-02; UC-01 step 2).
// Đọc QUA locate() (T1/T2) — không thao tác DOM ngoài owa-adapter (GĐ3 Done #6). bodyText chuẩn hóa
// qua textContent (SR-10). Gate BR-14: bodyText rỗng → ERR-10 ngay tại reader, KHÔNG gọi LLM.
import { AppError } from "../../shared/errors";
import type { EmailData, CancelSignal } from "../../shared/types";
import type { OwaViewInfo } from "./detector";
import { readSender, readRecipients, readFromLine } from "./recipients";
import { withAttachmentTexts } from "./attachment-reader";
import { analyzeViaCopilot } from "./copilot-bridge";
import { resolveMessageId } from "./message-id";
import type { FunctionKey } from "./selectors";

export type LocateFn = (functionKey: FunctionKey, question: string) => Promise<Element | null>;

const SUBJECT_PROBE = '[role="heading"], h1, h2';
const BODY_PROBE = '[aria-label*="body" i]';
const EXCERPT_CHARS = 160;

// UC-01 step 2 — reader qua self-healing locator; ERR-06 khi không thấy vùng đọc (EF-3).
// signal (uat58): start mới/cancel() flip → nhánh Copilot tự hủy, không còn pipeline mồ côi.
export async function readEmail(locate: LocateFn, view: OwaViewInfo, signal?: CancelSignal): Promise<EmailData> {
  let container = view.container ?? (await locate("reading-pane", "vùng đọc email đang mở"));
  if (!container) throw new AppError("ERR-06", "errors.owaNotFound");
  // UAT — OWA mới (outlook.cloud.microsoft): detector findConversation trả [data-conversation]
  // ĐẦU TIÊN trong document = hàng trong DANH SÁCH thư (mỗi row là 1 conversation), KHÔNG phải
  // pane đọc → reader đọc nhầm ribbon/list. Validate: container phải chứa body-like text
  // (≥300 ký tự); nếu nhỏ hơn → dùng pane lớn hơn từ locate (aria "N messages", len 5768).
  const located = await locate("reading-pane", "vùng đọc email đang mở").catch(() => null);
  if (located !== null && (located.textContent ?? "").length > (container.textContent ?? "").length) {
    container = located;
  }
  let subject = textOf(container.querySelector(SUBJECT_PROBE));
  if (subject.length === 0) {
    // UAT — OWA mới: heading đầu trong container rỗng; subject nằm ở ô riêng
    // ([aria-label*=Subject] / data-testid) — fallback theo thứ tự probe phổ biến.
    subject =
      textOf(container.querySelector('[aria-label*="Subject" i]')) ||
      textOf(container.querySelector("[data-testid*='subject' i]")) ||
      textOf(container.querySelector('[placeholder*="Subject" i], [placeholder*="Tiêu đề" i]'));
  }
  const sender = readSender(container);
  let bodyText = normalizeBody(extractBodyText(container));
  if (bodyText.replace(/\s/g, "").length < 40) {
    // UAT — OWA mới (outlook.cloud.microsoft): container locate được sai (ribbon "Quick steps"),
    // thân email thật nằm trong <iframe> cùng origin mà querySelector không với tới. Tìm iframe
    // có body text dài nhất → nâng container lên ancestor chứa header (From/To/subject).
    const context = findReadingContext();
    if (context !== null) {
      container = context.container;
      bodyText = normalizeBody(context.bodyDoc.body?.textContent ?? "");
    }
  }
  if (bodyText.trim().length === 0) {
    throw new AppError("ERR-10", "errors.emptyEmail"); // BR-14 — chặn ở reader, không phải adapter LLM
  }
  const id = await resolveMessageId(container, subject, sender.email, bodyText);
  if (!id) throw new AppError("ERR-12", "errors.missingMessageId"); // fallback cứng §7.5
  const email: EmailData = {
    messageId: id.messageId,
    subject: subject,
    sender: sender,
    to: readRecipients(container, "to"),
    cc: readRecipients(container, "cc"),
    bodyText: bodyText,
    hasAttachment: detectAttachments(container),
    threadContext: view.view === "conversation" ? buildThreadContext(container) : undefined,
    detectedView: view.view === "unknown" ? "reading-pane" : view.view
  };
  // GĐ-B (20/10) — Copilot THAY LLM+VL (user quyết): "Summarize this email" → DIFF text node
  // chống cắt cap → tóm tắt TƯƠI trả về email.copilotSummary → AnalyzeController hiển thị
  // VERBATIM, KHÔNG gọi LLM stream. Fail (không license/entry/timeout) → pipeline cũ bên dưới.
  try {
    const copilot = await analyzeViaCopilot(signal);
    if (copilot !== null && copilot.text.trim().length > 0) {
      console.log("[AIMH][copilot] tóm tắt TƯƠI (len=" + String(copilot.text.length) + ") — hiển thị nguyên văn, không gọi LLM local");
      return { ...email, copilotSummary: copilot.text, copilotHtml: copilot.html };
    }
  } catch (error) {
    console.warn("[AIMH][copilot] fail — fallback pipeline cũ:", String(error).slice(0, 120));
  }
  return withAttachmentTexts(email); // UAT 18/10 Plan A — text attachment (KHÔNG chặn khi lỗi)
}

// UAT — OWA mới render thân email trong <iframe> cùng origin: quét iframe, chọn doc có body
// text dài nhất (>200 ký tự — loại iframe rỗng/ads); container = ancestor gần iframe còn chứa
// thêm nội dung header (From/To/subject). KHÔNG mutate DOM (SR-10 — chỉ đọc).
function findReadingContext(): { container: Element; bodyDoc: Document } | null {
  let best: { frame: HTMLIFrameElement; doc: Document; len: number } | null = null;
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = frame.contentDocument;
      const text = (doc?.body?.textContent ?? "").trim();
      if (doc !== null && doc.body !== null && text.length > 200 && (best === null || text.length > best.len)) {
        best = { frame: frame, doc: doc, len: text.length };
      }
    } catch {
      /* cross-origin — bỏ qua */
    }
  }
  if (best === null) return null;
  let container: Element = best.frame;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = container.parentElement;
    if (parent === null) break;
    container = parent;
    const extra = (parent.textContent ?? "").length - best.len;
    if (extra > 120) break; // ancestor đã chứa thêm header/metadata — đủ làm vùng đọc
  }
  return { container: container, bodyDoc: best.doc };
}

// Body: probe aria-label *body* → fallback con trực tiếp chứa nhiều text nhất (structural).
// UAT (outlook.cloud.microsoft): container = conversation root (aria "N messages") — con trực tiếp
// gồm NHÁNH RIBBON ("Quick steps" + glyph icons, nhiều button) và NHÁNH THÂN EMAIL. largestTextChild
// cũ chọn nhầm ribbon → loại nhánh có >5 button hoặc chứa chữ "Quick steps" (spike 15/10).
function extractBodyText(container: Element): string {
  const bodyNode =
    container.querySelector(BODY_PROBE) ?? largestTextChildExcludingToolbars(container);
  return bodyNode !== null ? bodyNode.textContent ?? "" : container.textContent ?? "";
}

function largestTextChildExcludingToolbars(container: Element): Element | null {
  let best: Element | null = null;
  let bestScore = 0;
  for (const child of container.children) {
    const text = (child.textContent ?? "").trim();
    const len = text.length;
    if (len === 0) continue;
    const buttonCount = child.querySelectorAll("button, [role='button']").length;
    const isToolbars = buttonCount > 5 || text.includes("Quick steps"); // ribbon/toolbar nhánh — loại
    if (isToolbars) continue;
    if (len > bestScore) {
      best = child;
      bestScore = len;
    }
  }
  return best;
}

// SR-10 — normalize: bỏ tag (textContent), gộp whitespace trong dòng, giữ xuống dòng đoạn (§3.1.4).
export function normalizeBody(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0).join("\n");
}

// AF-1 UC-01 — thread context khi conversation: các message block TRƯỚC email hiện tại (cũ nhất trước).
function buildThreadContext(container: Element): EmailData["threadContext"] {
  const blocks = Array.from(container.querySelectorAll('[aria-label*="Message" i]'));
  if (blocks.length < 2) return undefined;
  return blocks.slice(0, -1).map((block) => ({
    subject: textOf(block.querySelector(SUBJECT_PROBE)),
    from: readFromLine(block),
    excerpt: normalizeBody(block.textContent ?? "").slice(0, EXCERPT_CHARS)
  }));
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? "";
}

// UAT — phát hiện đính kèm trong pane: probe aria-label attach/đính kèm + chip tên file có
// phần mở rộng phổ biến (snapshot OWA mới: option "....xlsx Open 36 KB"). CHỈ đọc — SR-10.
function detectAttachments(container: Element): boolean {
  if (container.querySelector('[aria-label*="attach" i], [aria-label*="đính kèm" i], [title*="attach" i]') !== null) {
    return true;
  }
  const filePattern = /\.(xlsx?|docx?|pptx?|pdf|zip|rar|eml|msg|csv)\b/i;
  for (const el of Array.from(container.querySelectorAll("[aria-label], [title]"))) {
    const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
    if (filePattern.test(label)) return true;
  }
  return false;
}
