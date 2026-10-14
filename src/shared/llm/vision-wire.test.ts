// src/shared/llm/vision-wire.test.ts — GĐ4 T3 (FR-GD4-05): serialize visionImage theo wire format
// từng provider; GATED — không có visionImage → body giữ nguyên (regression guard contract GĐ2).
import { describe, expect, it } from "vitest";
import { applyAnthropicImage, applyGeminiImage, applyOpenAIImage } from "./vision-wire";

const IMAGE = { base64: "QUJDREVG", mediaType: "image/jpeg" };

describe("vision-wire — serialize ChatOptions.visionImage (GĐ4, additive)", () => {
  it("OpenAI family: content cuối thành [{text},{image_url data URL}]", () => {
    const body: Record<string, unknown> = {
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "Tìm: nút Reply" }
      ]
    };
    applyOpenAIImage(body, IMAGE);
    const content = (body["messages"] as { content: unknown }[])[1]?.content as { type: string }[];
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "Tìm: nút Reply" });
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,QUJDREVG" }
    });
    const system = (body["messages"] as { content: string }[])[0];
    expect(system?.content).toBe("system prompt"); // system giữ nguyên
  });

  it("Anthropic: content cuối thành [{text},{image source base64}]", () => {
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: "Tìm: compose box" }]
    };
    applyAnthropicImage(body, IMAGE);
    const content = (body["messages"] as { content: { type: string }[] }[])[0]?.content ?? [];
    expect(content[0]).toEqual({ type: "text", text: "Tìm: compose box" });
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJDREVG" }
    });
  });

  it("Gemini: part {inline_data} nối vào parts content cuối", () => {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: "Tìm: compose box" }] }]
    };
    applyGeminiImage(body, IMAGE);
    const parts = ((body["contents"] as { parts: { text?: string; inline_data?: unknown }[] }[])[0]?.parts ?? []);
    expect(parts).toHaveLength(2);
    expect(parts[0]?.text).toBe("Tìm: compose box");
    expect(parts[1]?.inline_data).toEqual({ mime_type: "image/jpeg", data: "QUJDREVG" });
  });

  it("GATED: danh sách message rỗng → helper no-op, không ném (regression GĐ2 text-only)", () => {
    const emptyMessages: Record<string, unknown> = { messages: [] };
    const emptyContents: Record<string, unknown> = { contents: [] };
    expect(() => applyOpenAIImage(emptyMessages, IMAGE)).not.toThrow();
    expect(() => applyAnthropicImage(emptyMessages, IMAGE)).not.toThrow();
    expect(() => applyGeminiImage(emptyContents, IMAGE)).not.toThrow();
    expect(emptyMessages["messages"]).toEqual([]);
  });
});
