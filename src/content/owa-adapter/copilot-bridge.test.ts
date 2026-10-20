// src/content/owa-adapter/copilot-bridge.test.ts — entry/popup/panel discovery bằng DOM API (SR-10).
import { beforeEach, describe, expect, it } from "vitest";
import { describeCopilotLines, findCopilotEntry, findCopilotPanel } from "./copilot-bridge";

function el(tag: string, attrs: Record<string, string>, text = ""): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text.length > 0) node.appendChild(document.createTextNode(text));
  return node;
}

describe("findCopilotEntry", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("aria-label Copilot ưu tiên; fallback nth-child(2) button; không BottomBar → null", () => {
    const bar = el("div", { id: "BottomBar" });
    bar.appendChild(el("div", {})); // child 1
    bar.appendChild(el("div", {}, "nav")); // child 2
    ((bar.children[1] as Element)).appendChild(el("button", { id: "bcd" }));
    bar.appendChild(el("button", { "aria-label": "Copilot" }));
    document.body.append(bar);
    expect(findCopilotEntry()!.getAttribute("aria-label")).toBe("Copilot");
    document.body.replaceChildren();
    const bar2 = el("div", { id: "BottomBar" });
    bar2.appendChild(el("div", {}));
    bar2.appendChild(el("div", {}, "nav"));
    ((bar2.children[1] as Element)).appendChild(el("button", {}));
    document.body.append(bar2);
    expect(findCopilotEntry()).not.toBeNull();
    document.body.replaceChildren();
    expect(findCopilotEntry()).toBeNull();
  });
});

describe("findCopilotPanel", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("chultiple iframe — chỉ frame id chứa copilotSidePanel", () => {
    document.body.append(el("iframe", { id: "cacheable-iframe:abc-renderingSurface:copilotSidePanel-userId:X-10033FFFA7F0C052" }));
    document.body.append(el("iframe", { id: "cacheable-iframe:other" }));
    expect(findCopilotPanel()).not.toBeNull();
    document.body.replaceChildren();
    expect(findCopilotPanel()).toBeNull();
  });
});

describe("describeCopilotLines", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("không có gì → 3 dòng trạng thái KHÔNG/chưa/đóng", () => {
    const lines = describeCopilotLines();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("KHÔNG THẤY");
    expect(lines[2]).toContain("đóng");
  });

  it("có entry + panel → trạng thái HIện/MỞ (GUID không lọt)", () => {
    const bar = el("div", { id: "BottomBar" });
    bar.appendChild(el("button", { "aria-label": "Copilot" }));
    document.body.append(bar);
    document.body.append(el("iframe", { id: "cacheable-iframe:b5abf2ae-c16b-4310-8f8a-d3bcdb52f162-renderingSurface:copilotSidePanel-userId:DEFDEFDE-FDEF-DEFD-EFDE-FDEFDEFDEFDE-10033FFFA7F0C052" }));
    const allLines = describeCopilotLines();
    expect(allLines[0]).toContain("Copilot");
    expect(allLines[2]).toContain("MỞ");
    expect(allLines.join("\n")).not.toContain("b5abf2ae"); // GUID ẩn — M-2
  });
});
