// src/content/owa-adapter/detector.test.ts — FR-GD3-01: nhận diện reading-pane / popout / conversation
// / unknown bằng STRUCTURAL PROBE (role/aria-label functional/data-*) — KHÔNG đoán theo text (§3.1.4).
import { beforeEach, describe, expect, it } from "vitest";
import { detectView } from "./detector";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("detector — 3 chế độ + unknown (structural probe)", () => {
  it("reading-pane: message trong [role=main]", () => {
    const main = el("div", { role: "main" });
    const message = el("div", { "aria-label": "Message body" }, "Nội dung bất kỳ — không dùng để đoán");
    main.appendChild(message);
    document.body.appendChild(main);
    const info = detectView();
    expect(info.view).toBe("reading-pane");
    expect(info.container).toBe(message);
  });

  it("popout: message trong [role=dialog]", () => {
    const dialog = el("div", { role: "dialog" });
    const message = el("div", { "aria-label": "Message body" });
    dialog.appendChild(message);
    document.body.appendChild(dialog);
    const info = detectView();
    expect(info.view).toBe("popout");
    expect(info.container).toBe(dialog); // container = dialog cả khung popout
  });

  it("conversation: [data-conversation] probe → conversation + container", () => {
    const conversation = el("div", { "data-conversation": "true" });
    conversation.appendChild(el("div", { "aria-label": "Message body" }, "email 1"));
    conversation.appendChild(el("div", { "aria-label": "Message body" }, "email 2"));
    document.body.appendChild(conversation);
    const info = detectView();
    expect(info.view).toBe("conversation");
    expect(info.container).toBe(conversation);
  });

  it("conversation: >1 message block trong main (không có data-conversation) → conversation", () => {
    const main = el("div", { role: "main" });
    main.appendChild(el("div", { "aria-label": "Message body" }, "thư trước"));
    main.appendChild(el("div", { "aria-label": "Message body" }, "thư hiện tại"));
    document.body.appendChild(main);
    expect(detectView().view).toBe("conversation");
  });

  it("unknown: trang không có message block nào → unknown + container null (EF-3 UC-01)", () => {
    document.body.appendChild(el("div", { role: "main" }, "không phải message"));
    const info = detectView();
    expect(info.view).toBe("unknown");
    expect(info.container).toBeNull();
  });

  it("popout ưu tiên reading-pane khi cả dialog lẫn main đều có message", () => {
    const dialog = el("div", { role: "dialog" });
    dialog.appendChild(el("div", { "aria-label": "Message body" }));
    const main = el("div", { role: "main" });
    main.appendChild(el("div", { "aria-label": "Message body" }));
    document.body.append(dialog, main);
    expect(detectView().view).toBe("popout");
  });
});
