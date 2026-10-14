// src/content/owa-adapter/layout-hash.ts — signature 3 cấp (tag+role) của 4 vùng probe (TDD §3.1.2,
// FSD 6.6c; BR-06). Hash CHỈ phản ánh CẤU TRÚC — KHÔNG hash nội dung email (đổi email → cache còn).
// SR-09: SHA-256 qua crypto.subtle.digest (bỏ djb2/sha1) — nhất quán với synthetic id S3 (GĐ5).
export interface ProbeRegion {
  id: string;
  probe: string;
}

// 4 vùng chức năng theo FSD 6.6c (case-insensitive attribute — selectors cùng chuẩn §3.1.1).
export const REGIONS: readonly ProbeRegion[] = [
  { id: "toolbar", probe: '[role="toolbar"]' },
  { id: "list", probe: '[role="list"]' },
  { id: "reading", probe: '[aria-label*="Message" i], [data-conversation]' },
  { id: "compose", probe: '[role="textbox"][aria-multiline="true"]' }
];

const SIGNATURE_DEPTH = 3;
const MAX_CHILDREN = 6;

// signature 3 cấp: tag + role, 6 con đầu mỗi cấp (FSD 6.6c — structuralSignature).
export function structuralSignature(el: Element, depth: number): string {
  if (depth === 0 || !el) return "";
  const role = el.getAttribute("role") ?? "";
  const head = el.tagName + ">" + role;
  const children = Array.from(el.children)
    .slice(0, MAX_CHILDREN)
    .map((child) => structuralSignature(child, depth - 1))
    .join(">");
  return head + (children.length > 0 ? ">" + children : "");
}

// SHA-256 hex (SR-09) — dùng chung cho layoutHash + synthetic messageId S3 (GĐ5).
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// layoutHash(): mỗi vùng → "id:signature" (không thấy → "-"), nối "|" → SHA-256 hex 64 ký tự.
// MS đổi UI → signature đổi → hash đổi → toàn bộ entry cũ tự vô hiệu (BR-06).
export async function computeLayoutHash(root: ParentNode = document): Promise<string> {
  const parts = REGIONS.map((region) => {
    const el = root.querySelector(region.probe);
    return region.id + ":" + (el ? structuralSignature(el, SIGNATURE_DEPTH) : "-");
  });
  return sha256Hex(parts.join("|"));
}
