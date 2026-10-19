// src/background/preview-reader.test.ts — imagesFromSnapshot: trích src thẻ IMG từ DOMSnapshot (UAT 20/10).
import { describe, expect, it } from "vitest";
import { imagesFromSnapshot } from "./preview-reader";

interface ImgSpec {
  src?: string;
  id?: string;
}

// Helper dựng snapshot chuẩn CDP: bảng strings + node IMG với attributes phẳng [nameIdx, valueIdx, …].
function buildSnapshot(imgs: ImgSpec[]): unknown {
  const strings: string[] = [];
  const intern = (value: string): number => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };
  const nodeName: number[] = [];
  const attributes: number[][] = [];
  for (const img of imgs) {
    nodeName.push(intern("IMG"));
    const pairs: number[] = [];
    if (img.src !== undefined) pairs.push(intern("src"), intern(img.src));
    if (img.id !== undefined) pairs.push(intern("id"), intern(img.id));
    attributes.push(pairs);
  }
  return { strings: strings, documents: [{ nodes: { nodeName: nodeName, attributes: attributes } }] };
}

describe("imagesFromSnapshot", () => {
  it("trích data URL src của IMG", () => {
    const result = imagesFromSnapshot(buildSnapshot([{ src: "data:image/jpeg;base64,AAA" }]));
    expect(result).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("trích nhiều ảnh theo thứ tự DOM khi không có id", () => {
    const result = imagesFromSnapshot(buildSnapshot([
      { src: "https://x/1.png" },
      { src: "https://x/2.png" }
    ]));
    expect(result).toEqual(["https://x/1.png", "https://x/2.png"]);
  });

  it("sort theo số trong id (#i1/#i2/…) bất kể thứ tự DOM — đúng thứ tự trang Word", () => {
    const result = imagesFromSnapshot(buildSnapshot([
      { id: "i2", src: "https://x/p2.png" },
      { id: "i1", src: "https://x/p1.png" },
      { id: "i10", src: "https://x/p10.png" },
      { id: "i3", src: "https://x/p3.png" }
    ]));
    expect(result).toEqual([
      "https://x/p1.png", "https://x/p2.png", "https://x/p3.png", "https://x/p10.png"
    ]);
  });

  it("img có src không có id → giữ thứ tự DOM, đẩy sau nhóm có id", () => {
    const result = imagesFromSnapshot(buildSnapshot([
      { src: "https://x/no-id.png" },
      { id: "i1", src: "https://x/p1.png" }
    ]));
    expect(result).toEqual(["https://x/p1.png", "https://x/no-id.png"]);
  });

  it("IMG không có src → bỏ qua, không lỗi", () => {
    expect(imagesFromSnapshot(buildSnapshot([{ id: "i1" }, { src: "https://x/ok.png" }])))
      .toEqual(["https://x/ok.png"]);
    expect(imagesFromSnapshot(buildSnapshot([]))).toEqual([]);
  });

  it("snapshot rỗng/hỏng → mảng rỗng", () => {
    expect(imagesFromSnapshot(undefined)).toEqual([]);
    expect(imagesFromSnapshot({})).toEqual([]);
    expect(imagesFromSnapshot({ strings: [], documents: [] })).toEqual([]);
  });
});
