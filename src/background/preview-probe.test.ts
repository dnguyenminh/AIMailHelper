// src/background/preview-probe.test.ts — M-2 redact: không token/uuid lọt vào report UC-09.
import { describe, expect, it } from "vitest";
import { redactSrc } from "./preview-probe";

describe("redactSrc", () => {
  it("data: → mime + độ dài, bỏ payload", () => {
    expect(redactSrc("data:image/jpeg;base64,ABCDEF")).toBe("data:image/jpeg;base64,<29 chars>");
  });

  it("blob: → chỉ báo độ dài (uuid là token)", () => {
    expect(redactSrc("blob:https://res.cdn.office.net/8f0e-11be")).toBe("blob:<41 chars>");
  });

  it("about: giữ nguyên (không藏着 nội dung)", () => {
    expect(redactSrc("about:blank")).toBe("about:blank");
  });

  it("http → origin + path cuối, query/hash strip", () => {
    expect(redactSrc("https://cdn.office.net/wv/p1.png?ct=1&usid=TOKEN123#frag"))
      .toBe("https://cdn.office.net/…/p1.png");
    expect(redactSrc("https://cdn.office.net/wv/p1.png?ct=1&usid=TOKEN123#frag")).not.toContain("TOKEN123");
  });

  it("không scheme đầy đủ → trả nguyên phần trước query", () => {
    expect(redactSrc("/wv/p1.png?id=1")).toBe("/wv/p1.png");
  });
});
