// src/content/owa-adapter/copilot-reply.test.ts — uat93: pure functions của soạn reply Copilot.
// buildReplyPrompt: tone/ngôn ngữ/extra → 1 dòng; extractDraft: cắt echo prompt + nhãn Copilot.
import { describe, expect, it } from "vitest";
import { buildReplyPrompt, extractDraft } from "./copilot-reply";

describe("buildReplyPrompt", () => {
  it("dựng prompt 1 dòng chứa giọng điệu + ngôn ngữ + yêu cầu chỉ xuất nháp", () => {
    const prompt = buildReplyPrompt("chinh-thuc", "vi");
    expect(prompt).toContain("Viết thư trả lời");
    expect(prompt).toContain("trang trọng, chuyên nghiệp");
    expect(prompt).toContain("tiếng Việt");
    expect(prompt).toContain("Chỉ xuất nội dung thư trả lời");
    expect(prompt.split("\n").length).toBe(1);
  });

  it("tone ngắn gọn + tiếng Anh + extra → phản ánh đúng; auto → cùng ngôn ngữ email", () => {
    expect(buildReplyPrompt("ngan-gon", "en")).toContain("ngắn gọn, súc tích");
    expect(buildReplyPrompt("ngan-gon", "en")).toContain("tiếng Anh");
    expect(buildReplyPrompt("than-mat", "auto")).toContain("cùng ngôn ngữ với email nhận được");
    const withExtra = buildReplyPrompt("chinh-thuc", "vi", "nhắc deadline thứ Sáu");
    expect(withExtra).toContain("Yêu cầu thêm: nhắc deadline thứ Sáu");
  });

  it("extra cap 500 ký tự — phần dư bị cắt (prompt ≤4000 theo handler)", () => {
    const long = "x".repeat(600);
    expect(buildReplyPrompt("chinh-thuc", "vi", long)).not.toContain("x".repeat(501));
  });
});

describe("extractDraft", () => {
  const prompt = buildReplyPrompt("chinh-thuc", "vi");

  it("cắt echo prompt nguyên văn — giữ nháp + xuống dòng", () => {
    const fresh = "Bạn đã nói: " + prompt + "\n\nKính gửi anh chị,\n\nCảm ơn thư của anh chị.";
    expect(extractDraft(fresh, prompt)).toContain("Kính gửi anh chị");
    expect(extractDraft(fresh, prompt)).not.toContain("Viết thư trả lời");
  });

  it("echo gập khoảng trắng (panel cắt dòng) → vẫn cắt được qua flat-match", () => {
    const folded = "You said: " + prompt.replace(/\s+/g, " ");
    const draft = extractDraft(folded + " Chào bạn, cảm ơn phản hồi.", prompt);
    expect(draft).toContain("Chào bạn");
  });

  it("nhãn 'Copilot said' cuối → bỏ; prompt ngắn (<24) → giữ exchange làm nháp", () => {
    const labeled = "You said: " + prompt + "\nCopilot said: Cảm ơn thư.\nCopilot said: Thân chào anh.";
    expect(extractDraft(labeled, prompt)).toContain("Thân chào anh.");
    expect(extractDraft("You said: ok\nNội dung thư trả lời ở đây đủ dài.", "ok")).toContain("Nội dung thư trả lời");
  });
});
