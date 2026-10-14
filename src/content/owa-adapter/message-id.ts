// src/content/owa-adapter/message-id.ts — strategy chain message-id (TDD §7.5; Open Issue #5 CHỐT).
// S1 attribute probe → S2 href regex AAMk → S3 synthetic SHA-256 (SR-09 — trunc 16 hex, provenance
// "synthetic"). Không đủ dữ liệu → ERR-12 (caller quyết: triage bỏ qua item, GĐ5).
import { sha256Hex } from "./layout-hash";

const ID_ATTRIBUTES = ["data-itemid", "data-convid", "data-message-id"] as const;
// S2 — ExchangeId prefix "AAMk" (SR-17: regex tuyến tính, không ReDoS — SECURITY-REVIEW verified).
const AAMK_PATTERN = /(AAMk[A-Za-z0-9+/=]{20,})/;
const SYNTHETIC_HEX_CHARS = 16; // ≥ 64-bit (SR-09)

export interface MessageIdResult {
  messageId: string;
  provenance: "native" | "synthetic";
}

export function extractNativeId(container: Element): string | null {
  for (const attr of ID_ATTRIBUTES) {
    if (container.hasAttribute(attr)) {
      const value = container.getAttribute(attr)?.trim();
      if (value) return value; // S1 — ưu tiên attribute probe (§7.5)
    }
  }
  const holder = container.querySelector(ID_ATTRIBUTES.map((a) => "[" + a + "]").join(","));
  if (holder) {
    for (const attr of ID_ATTRIBUTES) {
      const value = holder.getAttribute(attr)?.trim();
      if (value) return value;
    }
  }
  return null;
}

export function extractHrefId(container: Element): string | null {
  for (const link of container.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    const match = AAMK_PATTERN.exec(href);
    const id = match?.[1];
    if (id) return id; // S2 — group đầu
  }
  return null;
}

// S3 — synthetic:{sha256(subject|sender.email|preview-50) trunc 16 hex} — đổi nội dung row →
// id đổi → cache miss tự nhiên (an toàn, chỉ tốn thêm token — §7.5).
export async function synthesizeId(subject: string, senderEmail: string, preview: string): Promise<string> {
  const basis = [subject, senderEmail, preview.slice(0, 50)].join("|");
  const hex = await sha256Hex(basis);
  return "synthetic:" + hex.slice(0, SYNTHETIC_HEX_CHARS);
}

// Chain đầy đủ: S1 → S2 → S3; CẢ subject+sender+preview đều rỗng → ERR-12 (caller log + bỏ qua).
// Reader/analyze: bodyText luôn khác rỗng (BR-14 gate trước) → S3 luôn khả dụng khi không có id thật.
export async function resolveMessageId(container: Element, subject: string, senderEmail: string, preview: string): Promise<MessageIdResult | null> {
  const native = extractNativeId(container) ?? extractHrefId(container);
  if (native) return { messageId: native, provenance: "native" };
  if (subject.length === 0 && senderEmail.length === 0 && preview.trim().length === 0) return null;
  return { messageId: await synthesizeId(subject, senderEmail, preview), provenance: "synthetic" };
}
