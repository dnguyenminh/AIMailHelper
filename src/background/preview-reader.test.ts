// src/background/preview-reader.test.ts — imagesFromSnapshot: trích src thẻ IMG từ DOMSnapshot (UAT 20/10).
import { describe, expect, it } from "vitest";
import { imagesFromSnapshot } from "./preview-reader";

interface TestSnapshot {
  strings: string[];
  documents: { nodes: { nodeName: number[]; attributes?: number[][] } }[];
}

function snap(nodeName: string[], attributes: number[][] | undefined): TestSnapshot {
  return {
    strings: ["IMG", "DIV", "src", "data:image/jpeg;base64,AAA", "https://x/1.png", "class", "page"],
    documents: [{ nodes: { nodeName: nodeName.map((n) => ({ IMG: 0, DIV: 1 })[n] ?? -1), attributes: attributes } }]
  };
}

describe("imagesFromSnapshot", () => {
  it("trích data URL src của IMG", () => {
    // IMG attrs: [src=2→"src", 3→data:...] ; DIV attrs: [class=5, page=6]
    const result = imagesFromSnapshot(snap(["IMG", "DIV"], [[2, 3], [5, 6]]));
    expect(result).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("trích http src + bỏ qua node không phải IMG", () => {
    const result = imagesFromSnapshot(snap(["DIV", "IMG"], [[5, 6], [2, 4]]));
    expect(result).toEqual(["https://x/1.png"]);
  });

  it("IMG không có src → bỏ qua, không lỗi", () => {
    expect(imagesFromSnapshot(snap(["IMG"], [[]]))).toEqual([]);
    expect(imagesFromSnapshot(snap(["IMG"], []))).toEqual([]); // attributes thiếu entry cho node
  });

  it("snapshot rỗng/hỏng → mảng rỗng", () => {
    expect(imagesFromSnapshot(undefined)).toEqual([]);
    expect(imagesFromSnapshot({})).toEqual([]);
    expect(imagesFromSnapshot({ strings: [], documents: [] })).toEqual([]);
  });
});
