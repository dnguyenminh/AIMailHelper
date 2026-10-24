// src/content/components/shadow-root.test.ts — uat95: key event gõ trong panel KHÔNG bubble
// ra document OWA (chặn phím tắt OWA: "n"=New mail, "r"=Reply… + steal focus khi đang gõ).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShadowHost } from "./shadow-root";

describe("shadow host key isolation (uat95)", () => {
  afterEach(() => {
    document.body.replaceChildren(); // SR-10 — không dùng .innerHTML kể cả trong test
  });

  it("keydown/keyup/keypress từ host KHÔNG tới document (listener OWA không thấy gì)", () => {
    const mount = createShadowHost();
    const spy = vi.fn();
    document.addEventListener("keydown", spy);
    document.addEventListener("keyup", spy);
    document.addEventListener("keypress", spy);
    for (const type of ["keydown", "keyup", "keypress"]) {
      mount.host.dispatchEvent(new KeyboardEvent(type, { bubbles: true, composed: true }));
    }
    expect(spy).not.toHaveBeenCalled();
    document.removeEventListener("keydown", spy);
    document.removeEventListener("keyup", spy);
    document.removeEventListener("keypress", spy);
  });

  it("gõ trong panel vẫn nhận được ở chính element (không chặn target phase)", () => {
    const mount = createShadowHost();
    const input = document.createElement("textarea");
    mount.shadow.appendChild(input);
    const seen = vi.fn();
    input.addEventListener("keydown", seen);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "n" }));
    expect(seen).toHaveBeenCalledTimes(1); // typing trong panel hoạt động bình thường
  });
});
