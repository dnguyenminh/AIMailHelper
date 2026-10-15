// src/content/owa-adapter/reader.ts — đọc EmailData (TDD §3.1.4; FR-GD3-02; UC-01 step 2).
// Đọc QUA locate() (T1/T2) — không thao tác DOM ngoài owa-adapter (GĐ3 Done #6). bodyText chuẩn hóa
// qua textContent (SR-10). Gate BR-14: bodyText rỗng → ERR-10 ngay tại reader, KHÔNG gọi LLM.
import { AppError } from "../../shared/errors";
import type { EmailData } from "../../shared/types";
import type { OwaViewInfo } from "./detector";
import { resolveMessageId } from "./message-id";
import type { FunctionKey } from "./selectors";

export type LocateFn = (functionKey: FunctionKey, question: string) => Promise<Element | null>;

const SUBJECT_PROBE = '[role="heading"], h1, h2';
const BODY_PROBE = '[aria-label*="body" i]';
const FROM_PATTERN = /^(From|Từ)\b/i;
const TO_PATTERN = /^(To|Đến)\b/i;
const CC_PATTERN = /^Cc\b/i;
const EMPTY_PERSON = { name: "", email: "" };
const EXCERPT_CHARS = 160;

// UC-01 step 2 — reader qua self-healing locator; ERR-06 khi không thấy vùng đọc (EF-3).
export async function readEmail(locate: LocateFn, view: OwaViewInfo): Promise<EmailData> {
  let container = view.container ?? (await locate("reading-pane", "vùng đọc email đang mở"));
  if (!container) throw new AppError("ERR-06", "errors.owaNotFound");
  let subject = textOf(container.querySelector(SUBJECT_PROBE));
  if (subject.length === 0) {
    // UAT — OWA mới: heading đầu trong container rỗng; subject nằm ở ô riêng
    // ([aria-label*=Subject] / data-testid) — fallback theo thứ tự probe phổ biến.
    subject =
      textOf(container.querySelector('[aria-label*="Subject" i]')) ||
      textOf(container.querySelector("[data-testid*='subject' i]")) ||
      textOf(container.querySelector('[placeholder*="Subject" i], [placeholder*="Tiêu đề" i]'));
  }
  const fromRaw = labeledValues(container, FROM_PATTERN)[0] ?? "";
  const sender = parsePerson(fromRaw) ?? { ...EMPTY_PERSON };
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
  return {
    messageId: id.messageId,
    subject: subject,
    sender: sender,
    to: readRecipients(container, TO_PATTERN),
    cc: readRecipients(container, CC_PATTERN),
    bodyText: bodyText,
    threadContext: view.view === "conversation" ? buildThreadContext(container) : undefined,
    detectedView: view.view === "unknown" ? "reading-pane" : view.view
  };
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

// Header row qua aria-label prefix (EN/VN) — structural attribute, không đoán theo text.
function labeledValues(container: Element, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const el of container.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") ?? "";
    if (!pattern.test(label)) continue;
    const sep = label.indexOf(":");
    values.push(sep >= 0 ? label.slice(sep + 1).trim() : label.replace(/^\S+\s*/, "").trim());
  }
  return values;
}

function readRecipients(container: Element, pattern: RegExp): { name: string; email: string }[] {
  const result: { name: string; email: string }[] = [];
  for (const raw of labeledValues(container, pattern)) {
    for (const part of raw.split(/[,;]/)) {
      const person = parsePerson(part.trim());
      if (person) result.push(person);
    }
  }
  return result;
}

// "An <an@x.com>" → {name:"An",email:"an@x.com"}; bare email → {name:"",email}; chỉ text → name.
export function parsePerson(raw: string): { name: string; email: string } | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const angled = /^([^<>]*?)\s*<([^<>@]+@[^<>@]+)>\s*$/.exec(value);
  if (angled && angled[1] !== undefined && angled[2] !== undefined) {
    return { name: angled[1].trim(), email: angled[2].trim() };
  }
  const bare = /([^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+)/.exec(value);
  if (bare && bare[1] !== undefined) return { name: value.replace(bare[1], "").trim(), email: bare[1] };
  return { name: value, email: "" };
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
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// AF-1 UC-01 — thread context khi conversation: các message block TRƯỚC email hiện tại (cũ nhất trước).
function buildThreadContext(container: Element): EmailData["threadContext"] {
  const blocks = Array.from(container.querySelectorAll('[aria-label*="Message" i]'));
  if (blocks.length < 2) return undefined;
  return blocks.slice(0, -1).map((block) => ({
    subject: textOf(block.querySelector(SUBJECT_PROBE)),
    from: labeledValues(block, FROM_PATTERN)[0] ?? "",
    excerpt: normalizeBody(block.textContent ?? "").slice(0, EXCERPT_CHARS)
  }));
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? "";
}
