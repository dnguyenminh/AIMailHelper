// src/content/owa-adapter/selectors.test.ts — T1 selector chain trên fixture DOM (GĐ1 Done #3; §3.1.1).
// BR-01/SR-14 invariant: send-button KHÔNG thuộc FunctionKey — chỉ selectors diagnose.
import { beforeEach, describe, expect, it } from "vitest";
import { SELECTOR_CHAINS, SEND_BUTTON_SELECTORS, resolveBySelectors } from "./selectors";
import { SelectorTier } from "./owa-adapter";

// SR-10: fixture dựng bằng DOM API (createElement/setAttribute/textContent) — không innerHTML.
function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildOwaFixture(label: string): void {
  document.body.textContent = "";
  const main = el("div", { role: "main" });
  const messageBody = el("div", { "aria-label": "Message body" });
  const toolbar = el("div", { role: "toolbar" });
  toolbar.appendChild(el("button", { "aria-label": label }, label));
  messageBody.appendChild(toolbar);
  main.appendChild(messageBody);
  const list = el("div", { role: "list", "aria-label": "Message list" });
  list.appendChild(el("div", { role: "listitem", "aria-label": "Message from A" }));
  const compose = el("textarea", { role: "textbox", "aria-multiline": "true", "aria-label": "Compose" });
  document.body.append(main, list, compose);
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("SelectorTier — T1 fast-path (FR-GD1-08)", () => {
  it("reply-button resolve qua aria-label EN (không khớp Reply all)", () => {
    buildOwaFixture("Reply");
    const element = resolveBySelectors("reply-button");
    expect(element?.getAttribute("aria-label")).toBe("Reply");
  });

  it("reply-button resolve qua aria-label VN 'Trả lời' (chain song song EN/VN)", () => {
    buildOwaFixture("Trả lời");
    const element = resolveBySelectors("reply-button");
    expect(element?.getAttribute("aria-label")).toBe("Trả lời");
  });

  it("inbox-list / inbox-item / compose-box / reading-pane / toolbar resolve trên fixture", () => {
    buildOwaFixture("Reply");
    expect(resolveBySelectors("reading-pane")).not.toBeNull(); // [role=main] [aria-label*=Message i]
    expect(resolveBySelectors("message-toolbar")?.getAttribute("role")).toBe("toolbar");
    expect(resolveBySelectors("inbox-list")?.getAttribute("role")).toBe("list");
    expect(resolveBySelectors("inbox-item")?.getAttribute("role")).toBe("listitem");
    expect(resolveBySelectors("compose-box")?.getAttribute("role")).toBe("textbox");
  });

  it("SelectorTier.resolve trả element qua facade; miss → null", async () => {
    buildOwaFixture("Reply");
    await expect(new SelectorTier().resolve("reply-button", "nút trả lời")).resolves.toBeInstanceOf(Element);
    document.body.textContent = "";
    document.body.appendChild(document.createElement("div"));
    await expect(new SelectorTier().resolve("reply-button", "")).resolves.toBeNull();
  });

  it("BR-01: send-button không nằm trong SELECTOR_CHAINS (chỉ diagnose)", () => {
    expect("send-button" in SELECTOR_CHAINS).toBe(false);
    expect(SEND_BUTTON_SELECTORS.length).toBeGreaterThan(0);
    expect(resolveBySelectors("inbox-list")).toBeDefined();
  });
});
