// src/shared/copilot-format.test.ts — cấu trúc theo LAYOUT: cùng dòng space / dòng mới \n /
// block \n\n; junk script/style loại; marker "You said"/"Bạn đã nói" cắt trao đổi mới nhất.
import { describe, expect, it } from "vitest";
import { filterNewExchange, junkAncestor, structureFromSnapshot } from "./copilot-format";
import type { RawDoc } from "./copilot-format";

function snap(strings: string[], nodeName: number[], nodeValue: number[], parentIndex: number[], nodeIndex: number[], bounds: number[]): { strings: string[]; documents: RawDoc[] } {
  return { strings, documents: [{ nodes: { nodeName, nodeValue, parentIndex }, layout: { nodeIndex, bounds } }] };
}

describe("structureFromSnapshot — y-range định dạng", () => {
  // node0 P | n1..n3 #text | n4 SCRIPT | n5 #text(under SCRIPT → junk) | n6 #text
  const strings = ["#text", "P", "SCRIPT", "Tóm tắt cùng dòng", "cùng dòng 2", "Dòng mới", "junk script text", "Block cách"];
  const snapshot = snap(
    strings,
    [1, 0, 0, 0, 2, 0, 0],           // nodeName index → strings
    [-1, 3, 4, 5, -1, 6, 7],         // nodeValue index
    [-1, 0, 0, 0, -1, 4, 0],         // parentIndex (n5 cha là SCRIPT → junk)
    [0, 1, 2, 3, 4, 5, 6],           // layout.nodeIndex
    [0, 100, 40, 24, 0, 100, 40, 24, 0, 104, 40, 24, 0, 130, 40, 24, 0, 140, 40, 24, 0, 140, 40, 24, 0, 300, 40, 24]
  );

  it("Δy≤10 cùng dòng; 10<Δy≤34 dòng mới; Δy>34 ngắt block; script/style bị loại", () => {
    expect(structureFromSnapshot(snapshot)).toBe("Tóm tắt cùng dòng cùng dòng 2\nDòng mới\n\nBlock cách");
  });
});

describe("junkAncestor", () => {
  // n0 SCRIPT (root) → n1 #text junk; n3 P (root) → n4 #text sạch; n2 STYLE cũng junk tổ tiên.
  const strings = ["#text", "SCRIPT", "STYLE", "P"];
  const nodeName = [1, 0, 2, 3, 0], parentIndex = [-1, 0, -1, -1, 3];

  it("SCRIPT/STYLE ở bất kỳ tổ tiên nào → junk; P → sạch", () => {
    expect(junkAncestor(strings, nodeName, parentIndex, 1)).toBe(true);
    expect(junkAncestor(strings, nodeName, parentIndex, 4)).toBe(false);
  });
});

describe("filterNewExchange — cắt trao đổi MỚI NHẤT", () => {
  it("en: lấy từ lượt 'You said' CUỐI (lượt cũ là lịch sử)", () => {
    const hist = "old chat You said: hi Copilot said: old You said: Summarize this email Copilot said: NEW";
    expect(filterNewExchange(hist)).toBe("You said: Summarize this email Copilot said: NEW");
  });

  it("vi: 'Bạn đã nói' cũng nhận diện; không marker → nguyên text", () => {
    expect(filterNewExchange("lịch sử Bạn đã nói: x Copilot: kết quả")).toBe("Bạn đã nói: x Copilot: kết quả");
    expect(filterNewExchange("chỉ có nội dung không marker")).toBe("chỉ có nội dung không marker");
  });
});
