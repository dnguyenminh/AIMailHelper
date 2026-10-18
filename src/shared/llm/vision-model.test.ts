// src/shared/llm/vision-model.test.ts — UAT 18/10 (rule user): chọn model cho vision-read.
// (1) vision.model riêng → dùng; (2) model chính khớp pattern VL → dùng; (3) còn lại → null (bỏ qua).
import { describe, expect, it } from "vitest";
import { isVisionCapableModel, resolveVisionModel } from "./vision-model";

describe("isVisionCapableModel — nhận diện model hỗ trợ VL theo tên", () => {
  it("model VL nổi tiếng → true", () => {
    for (const model of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "claude-3-5-sonnet", "claude-sonnet-4", "gemini-1.5-pro", "gemini-2.0-flash", "qwen2.5-vl-7b", "llava-1.6", "pixtral-12b", "grok-4"]) {
      expect(isVisionCapableModel(model), model).toBe(true);
    }
  });

  it("model text thuần → false", () => {
    for (const model of ["gpt-3.5-turbo", "gpt-4-turbo-2024", "llama-3-8b", "mistral-7b", "deepseek-chat", ""]) {
      expect(isVisionCapableModel(model), model).toBe(false);
    }
  });
});

describe("resolveVisionModel — rule user: VL riêng → text-VL → null", () => {
  it("có model VL riêng → LUÔN dùng nó (kể cả model chính cũng VL)", () => {
    expect(resolveVisionModel({ model: "gpt-4o", vision: { model: "qwen2.5-vl-72b" } })).toBe("qwen2.5-vl-72b");
  });

  it("không có VL riêng + model chính VL → dùng model chính", () => {
    expect(resolveVisionModel({ model: "gpt-4o-mini", vision: {} })).toBe("gpt-4o-mini");
  });

  it("không có VL riêng + model chính KHÔNG VL → null (caller bỏ qua vision)", () => {
    expect(resolveVisionModel({ model: "gpt-3.5-turbo", vision: {} })).toBeNull();
    expect(resolveVisionModel({ model: "llama-3-8b", vision: { model: "   " } })).toBeNull(); // whitespace = trống
  });
});
