// src/content/owa-adapter/copilot-sanitize.test.ts — uat60: outerHTML Copilot → MdNode
// (giữ h/p/ul-li/strong/a-http; vứt script/chip/svg/href không an toàn; div trong suốt).
import { describe, expect, it } from "vitest";
import { sanitizeCopilotHtml } from "./copilot-sanitize";

describe("copilot-sanitize — outerHTML → MdNode", () => {
  it("giữ heading/paragraph/strong đúng cấp", () => {
    const tree = sanitizeCopilotHtml("<div><p><strong>Mục đích:</strong></p><ul><li>Kiểm tra Pega CSM</li></ul></div>");
    expect(tree).toEqual([
      { tag: "p", children: [{ tag: "strong", children: [{ tag: "text", text: "Mục đích:" }] }] },
      { tag: "ul", children: [{ tag: "li", children: [{ tag: "text", text: "Kiểm tra Pega CSM" }] }] }
    ]);
  });

  it("bullet lồng nhau (li > ul) giữ 2 cấp", () => {
    const tree = sanitizeCopilotHtml("<ul><li>ngoài<ul><li>trong 1</li><li>trong 2</li></ul></li></ul>");
    expect(tree.length).toBe(1);
    const ul = tree[0] ?? { tag: "text" as const, children: [] };
    expect(ul.tag).toBe("ul");
    const li = (ul.children ?? [])[0] ?? { tag: "text" as const, children: [] };
    expect(li.tag).toBe("li");
    const nested = (li.children ?? []).find((c) => c.tag === "ul");
    expect(nested?.children?.length).toBe(2);
  });

  it("link http giữ href; javascript:/relative bị bóc vỏ", () => {
    const tree = sanitizeCopilotHtml('<div><a href="https://x.y/a">ok</a><a href="javascript:alert(1)">bad</a><a href="/rel">rel</a></div>');
    expect(tree[0]).toEqual({ tag: "a", href: "https://x.y/a", children: [{ tag: "text", text: "ok" }] });
    const texts = tree.map((n) => (n.tag === "text" ? n.text : "")).join(" ");
    expect(texts).toContain("bad");
    expect(texts).toContain("rel");
  });

  it("script/style/svg/button/chip gợi ý bị loại hoàn toàn", () => {
    const tree = sanitizeCopilotHtml('<div><script>alert(1)</script><style>.a{}</style><svg></svg><button>Copy</button>' +
      '<span data-testid="chat-suggestion">List the key action items</span><p>nội dung giữ</p></div>');
    expect(JSON.stringify(tree)).not.toContain("alert");
    expect(JSON.stringify(tree)).not.toContain("chat-suggestion");
    expect(JSON.stringify(tree)).toContain("nội dung giữ");
  });

  it("div/span trong suốt — text dồn lên, không tạo node lạ", () => {
    const tree = sanitizeCopilotHtml('<div><div class="___x"><span>Tóm tắt email:</span> <b>đậm</b></div></div>');
    expect(tree).toEqual([
      { tag: "text", text: "Tóm tắt email:" },
      { tag: "strong", children: [{ tag: "text", text: "đậm" }] }
    ]);
  });

  it("table → table/tr/td", () => {
    const tree = sanitizeCopilotHtml("<table><tr><td>A</td><td>B</td></tr></table>");
    expect(tree).toEqual([{ tag: "table", children: [{ tag: "tr", children: [
      { tag: "td", children: [{ tag: "text", text: "A" }] },
      { tag: "td", children: [{ tag: "text", text: "B" }] }
    ] }] }]);
  });

  it("markup lỏn (chỉ text) trả mảng rỗng → caller fallback raw", () => {
    expect(sanitizeCopilotHtml("loading screen")).toEqual([]);
  });
});
