// src/shared/triage.test.ts — validate/parse triage (GĐ5): §8.11 L3 caps (TD-8 reason ≤300),
// score integer 0..100, messageId khớp batch (chống hallucinate id); fail-closed FR-GD5-06.
import { describe, expect, it } from "vitest";
import { TRIAGE_CAPS, extractJsonArrayBlock, parseTriageScore, parseTriageScores } from "./triage";

const IDS = new Set(["m1", "m2"]);
const now = (): string => new Date().toISOString();

describe("parseTriageScore — §8.11 L3 fail-closed (BR-15)", () => {
  it("score/reason/messageId hợp lệ → TriageScore với analyzedAt ISO", () => {
    const score = parseTriageScore({ messageId: "m1", score: 85, reason: "Hạn chót hôm nay" }, IDS);
    expect(score).not.toBeNull();
    expect(score?.messageId).toBe("m1");
    expect(score?.score).toBe(85);
    expect(score?.reason).toBe("Hạn chót hôm nay");
    expect(Number.isNaN(Date.parse(score?.analyzedAt ?? ""))).toBe(false);
  });

  it("score 101 / -1 / 85.5 / không phải số → REJECT (không âm thầm sửa)", () => {
    expect(parseTriageScore({ messageId: "m1", score: 101, reason: "r" }, IDS)).toBeNull();
    expect(parseTriageScore({ messageId: "m1", score: -1, reason: "r" }, IDS)).toBeNull();
    expect(parseTriageScore({ messageId: "m1", score: 85.5, reason: "r" }, IDS)).toBeNull();
    expect(parseTriageScore({ messageId: "m1", score: "85", reason: "r" }, IDS)).toBeNull();
  });

  // TD-8 (TA review — M-1 bảng lớp 3 §8.11): reason > 300 ký tự → REJECT (EF-6), BẮT BUỘC GĐ5.
  it("TD-8: reason đúng 300 ký tự → chấp nhận; 301 ký tự → REJECT", () => {
    const at300 = parseTriageScore({ messageId: "m1", score: 10, reason: "x".repeat(TRIAGE_CAPS.reason) }, IDS);
    expect(at300).not.toBeNull();
    const over300 = parseTriageScore({ messageId: "m1", score: 10, reason: "x".repeat(TRIAGE_CAPS.reason + 1) }, IDS);
    expect(over300).toBeNull();
  });

  it("messageId không thuộc batch (hallucinate) / thiếu trường / sai shape → REJECT", () => {
    expect(parseTriageScore({ messageId: "khac", score: 50, reason: "r" }, IDS)).toBeNull();
    expect(parseTriageScore({ messageId: "m1", score: 50 }, IDS)).toBeNull();
    expect(parseTriageScore({ messageId: "m1", reason: "r" }, IDS)).toBeNull();
    expect(parseTriageScore("m1", IDS)).toBeNull();
    expect(parseTriageScore(null, IDS)).toBeNull();
    expect(parseTriageScore(["m1", 50, "r"], IDS)).toBeNull();
  });
});

describe("parseTriageScores — 6.6d fail-closed cho cả batch", () => {
  const raw = (items: unknown[]): string => JSON.stringify(items);

  it("mảng hợp lệ → chỉ phần tử hợp lệ được giữ; phần tử sai → bỏ qua (không gián đoạn)", () => {
    const scores = parseTriageScores(raw([
      { messageId: "m1", score: 90, reason: "OK" },
      { messageId: "m2", score: 200, reason: "score sai" },
      { messageId: "m3", score: 10, reason: "id lạ" },
      { messageId: "m2", score: 30, reason: "y".repeat(301) } // TD-8
    ]), IDS);
    expect(scores).toHaveLength(1);
    expect(scores[0]?.messageId).toBe("m1");
  });

  it("raw bọc text quanh mảng JSON (LLM thêm lời) → vẫn parse được", () => {
    const scores = parseTriageScores("Kết quả:\n" + raw([{ messageId: "m1", score: 5, reason: "r" }]) + "\nHết.", IDS);
    expect(scores).toHaveLength(1);
  });

  it("raw không chứa mảng / JSON hỏng / mảng rỗng → [] (batch coi như không có score hợp lệ)", () => {
    expect(parseTriageScores("không có gì", IDS)).toEqual([]);
    expect(parseTriageScores('{"a":1}', IDS)).toEqual([]);
    expect(parseTriageScores(raw([]), IDS)).toEqual([]);
    expect(parseTriageScores(raw([{ messageId: "m1" }]), IDS)).toEqual([]);
  });

  it("analyzedAt là thời điểm parse (freshness cho LRU evict — §7.4)", () => {
    const before = now();
    const scores = parseTriageScores(raw([{ messageId: "m1", score: 1, reason: "r" }]), IDS);
    const after = now();
    expect(scores[0] && scores[0].analyzedAt >= before && scores[0].analyzedAt <= after).toBe(true);
  });
});

describe("extractJsonArrayBlock — đếm ngoặc tôn trọng chuỗi", () => {
  it("trả khối mảng đầu tiên; ngoặc trong chuỗi không làm lệch", () => {
    expect(extractJsonArrayBlock('x [ {"a": "]"} ] y')).toBe('[ {"a": "]"} ]');
    expect(extractJsonArrayBlock("không mảng")).toBeNull();
    expect(extractJsonArrayBlock('[ {"a": 1')).toBeNull(); // chưa đóng
  });
});
