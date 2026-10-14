// src/shared/llm/prompts-vision.test.ts — GĐ4 T3 prompt (FR-GD4-05): SR-01 L1 clause luôn chèn;
// yêu cầu "(x%, y%)" tường minh; mô tả phần tử theo functionKey + ngôn ngữ; fallback key lạ.
import { describe, expect, it } from "vitest";
import { ANTI_INJECTION_CLAUSE } from "./prompts";
import { buildVisionMessages, visionElementDescription } from "./prompts-vision";

const REQUEST = { imageBase64: "QUJD", mediaType: "image/jpeg", functionKey: "reply-button", question: "" };

describe("buildVisionMessages (GĐ4)", () => {
  it("system chứa ANTI_INJECTION_CLAUSE (SR-01 L1) + chỉ dẫn trả (x%, y%) hoặc null", () => {
    const messages = buildVisionMessages(REQUEST);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain(ANTI_INJECTION_CLAUSE);
    expect(messages[0]?.content).toContain("(x%, y%)");
    expect(messages[0]?.content).toContain("null");
  });

  it("user message: mô tả phần tử theo functionKey (vi) + question đính kèm", () => {
    const messages = buildVisionMessages({ ...REQUEST, question: "nút màu xanh bên phải" });
    expect(messages[1]?.content).toContain("nút Trả lời (Reply)");
    expect(messages[1]?.content).toContain("nút màu xanh bên phải");
  });

  it("language=en → system + mô tả tiếng Anh; functionKey lạ → fallback mô tả chung", () => {
    const messages = buildVisionMessages(REQUEST, "en");
    expect(messages[0]?.content).toContain("screenshot");
    expect(messages[1]?.content).toContain("the Reply button");
    const fallback = buildVisionMessages({ ...REQUEST, functionKey: "custom-widget" }, "vi");
    expect(fallback[1]?.content).toContain("phần tử được yêu cầu: custom-widget");
    expect(visionElementDescription("unknown-key", "en")).toContain("the requested element: unknown-key");
  });
});
