// src/content/owa-adapter/layout-hash.test.ts — SR-09 + BR-06 (§12.3): determinism; 2 cấu trúc khác →
// hash khác; ĐỔI NỘI DUNG EMAIL → hash KHÔNG đổi (chỉ hash cấu trúc 4 vùng probe — FSD 6.6c);
// SHA-256 hex 64 ký tự qua crypto.subtle (SR-09); grep-ý: không djb2/sha1.
import { beforeEach, describe, expect, it } from "vitest";
import { computeLayoutHash, sha256Hex, structuralSignature } from "./layout-hash";

function el(tag: string, attrs: Record<string, string>, children: HTMLElement[] = []): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  for (const child of children) element.appendChild(child);
  return element;
}

function buildStructure(variant: "a" | "b"): void {
  document.body.textContent = "";
  const main = el("div", { role: "main" });
  const body = el("div", { "aria-label": "Message body" });
  const toolbar = el("div", { role: "toolbar" }, [el("button", { "aria-label": "Reply" })]);
  if (variant === "b") toolbar.appendChild(el("button", { "aria-label": "Delete" })); // đổi cấu trúc thật
  main.appendChild(toolbar);
  main.appendChild(body);
  const list = el("div", { role: "list" }, [el("div", { role: "listitem" })]);
  const compose = el("textarea", { role: "textbox", "aria-multiline": "true" });
  document.body.append(main, list, compose);
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("layoutHash — BR-06 + SR-09", () => {
  it("SR-09: determinism — cùng cấu trúc → cùng hash (SHA-256 hex 64 ký tự)", async () => {
    buildStructure("a");
    const first = await computeLayoutHash();
    const second = await computeLayoutHash();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("đổi cấu trúc (thêm nút trong toolbar) → hash ĐỔI (BR-06)", async () => {
    buildStructure("a");
    const hashA = await computeLayoutHash();
    buildStructure("b");
    const hashB = await computeLayoutHash();
    expect(hashA).not.toBe(hashB);
  });

  it("đổi LABEL chức năng (Reply → Forward) → hash KHÔNG đổi (signature chỉ tag+role — FSD 6.6c)", async () => {
    buildStructure("a");
    const before = await computeLayoutHash();
    const button = document.querySelector('[role="toolbar"] button');
    if (button) button.setAttribute("aria-label", "Forward");
    expect(await computeLayoutHash()).toBe(before); // selector stale sẽ tự dọn ở fromCache — BR-06 vẫn an toàn
  });

  it("đổi NỘI DUNG EMAIL (text trong body) → hash KHÔNG đổi (không hash nội dung — FSD 6.6c)", async () => {
    buildStructure("a");
    const before = await computeLayoutHash();
    const body = document.querySelector('[aria-label="Message body"]');
    if (body) body.textContent = "Nội dung email hoàn toàn khác — deadline mới, người gửi mới.";
    const after = await computeLayoutHash();
    expect(after).toBe(before);
  });

  it("thiếu vùng (không có compose) → vẫn hash được, signature '-' cho vùng trống", async () => {
    document.body.appendChild(el("div", { role: "main" }, [el("div", { "aria-label": "Message body" })]));
    expect(await computeLayoutHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("structuralSignature: tag+role, 3 cấp, 6 con đầu; depth 0 → rỗng", () => {
    const node = el("div", { role: "toolbar" }, [el("button", { "aria-label": "Reply" })]);
    expect(structuralSignature(node, 1)).toContain("DIV>toolbar");
    expect(structuralSignature(node, 3)).toContain("BUTTON");
    expect(structuralSignature(node, 0)).toBe("");
  });

  it("sha256Hex — vector chuẩn 'abc' (SR-09: crypto.subtle.digest)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
