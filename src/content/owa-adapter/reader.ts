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
  const container = view.container ?? (await locate("reading-pane", "vùng đọc email đang mở"));
  if (!container) throw new AppError("ERR-06", "errors.owaNotFound");
  const subject = textOf(container.querySelector(SUBJECT_PROBE));
  const fromRaw = labeledValues(container, FROM_PATTERN)[0] ?? "";
  const sender = parsePerson(fromRaw) ?? { ...EMPTY_PERSON };
  const bodyText = normalizeBody(extractBodyText(container));
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
function extractBodyText(container: Element): string {
  const bodyNode = container.querySelector(BODY_PROBE) ?? largestTextChild(container);
  return bodyNode !== null ? bodyNode.textContent ?? "" : container.textContent ?? "";
}

function largestTextChild(container: Element): Element | null {
  let best: Element | null = null;
  let bestLen = 0;
  for (const child of container.children) {
    const len = (child.textContent ?? "").trim().length;
    if (len > bestLen) {
      best = child;
      bestLen = len;
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
