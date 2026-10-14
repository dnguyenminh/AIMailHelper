// src/content/owa-adapter/message-id.test.ts — strategy chain §7.5: S1 attribute probe → S2 href
// regex AAMk → S3 synthetic SHA-256 (SR-09 — trunc 16 hex); không đủ dữ liệu → null (ERR-12 caller).
import { describe, expect, it } from "vitest";
import { extractHrefId, extractNativeId, resolveMessageId, synthesizeId } from "./message-id";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

describe("message-id — S1/S2/S3 chain (TDD §7.5)", () => {
  it("S1: data-itemid ưu tiên (attribute probe)", () => {
    const item = el("div", { "data-itemid": "  AAMkAAA=item  " });
    expect(extractNativeId(item)).toBe("AAMkAAA=item");
  });

  it("S1: attribute nằm ở con → vẫn thấy; trim id", () => {
    const item = el("div", {}, "");
    item.appendChild(el("div", { "data-convid": "conv-123" }));
    expect(extractNativeId(item)).toBe("conv-123");
  });

  it("S2: href deep-link chứa ExchangeId AAMk (regex tuyến tính — SR-17)", () => {
    const item = el("div", {});
    item.appendChild(el("a", { href: "https://outlook.office.com/mail/deeplink?itemID=AAMkABCDEFGH1234567890IJKLmnopQR+ST==" }));
    expect(extractHrefId(item)).toBe("AAMkABCDEFGH1234567890IJKLmnopQR+ST==");
  });

  it("S2: href không có AAMk → null", () => {
    const item = el("div", {}, "");
    item.appendChild(el("a", { href: "https://example.com/normal-link" }));
    expect(extractHrefId(item)).toBeNull();
  });

  it("S3: synthetic — determinism + SHA-256 trunc 16 hex + phân biệt nội dung khác (SR-09)", async () => {
    const a = await synthesizeId("Chào buổi sáng", "an@example.com", "Nội dung X");
    const b = await synthesizeId("Chào buổi sáng", "an@example.com", "Nội dung X");
    const c = await synthesizeId("Chào buổi sáng", "an@example.com", "Nội dung Y");
    expect(a).toMatch(/^synthetic:[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("chain: S1 có → native; S1 không + S2 có → native; cả hai không → synthetic; thiếu hết → null", async () => {
    const withAttr = el("div", { "data-itemid": "native-1" });
    expect((await resolveMessageId(withAttr, "s", "e@x", "p"))?.provenance).toBe("native");

    const withHref = el("div", {}, "");
    withHref.appendChild(el("a", { href: "x?itemID=AAMkABCDEFGH1234567890IJKLmnopQR" }));
    const s2 = await resolveMessageId(withHref, "s", "e@x", "p");
    expect(s2?.provenance).toBe("native");

    const bare = el("div", {});
    const s3 = await resolveMessageId(bare, "subject", "sender@example.com", "preview");
    expect(s3?.provenance).toBe("synthetic");
    expect(s3?.messageId.startsWith("synthetic:")).toBe(true);

    expect(await resolveMessageId(bare, "", "", "")).toBeNull(); // fallback cứng → ERR-12 caller
  });
});
