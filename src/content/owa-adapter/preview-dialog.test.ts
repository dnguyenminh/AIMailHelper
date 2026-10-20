// src/content/owa-adapter/preview-dialog.test.ts — LỚP 1 đọc ảnh trang Word trên dialog shell.
// Fixture dựng bằng DOM API (SR-10 — không innerHTML kể cả trong test): dialog Fluent Surface
// + imgs (data/blob/http; id i1/i2/i10/noid) — sort theo id, convert blob qua FileReader thật.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectDialogImages, describePreviewDialogLines, findPreviewDialog } from "./preview-dialog";

const deps = { fetchImpl: fetch, FileReaderCtor: FileReader };
const BLOB_PNG = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10])], { type: "image/png" });

// SR-10 — dựng node DOM…
function el(tag: string, attrs: Record<string, string>): Element {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

// Dialog Surface (fui-DialogSurface) + nội dung callback — thay body (không mutation OWA thật).
function buildDialog(builder: (surface: Element) => void): void {
  const dialog = el("div", { role: "dialog" });
  const surface = el("div", { class: "fui-DialogSurface r1u3t6p6 bogus" });
  builder(surface);
  dialog.appendChild(surface);
  document.body.replaceChildren(dialog); // replaceChildren — SR-10
}

describe("findPreviewDialog", () => {
  it("ưu tiên fui-DialogSurface; không có → [role=dialog] cuối; hoàn toàn không → null", () => {
    buildDialog((surface) => surface.appendChild(el("span", { class: "x" })));
    expect(findPreviewDialog()!.className).toContain("fui-DialogSurface");
    const onlyRole = el("div", { role: "dialog" });
    document.body.replaceChildren(onlyRole);
    expect(findPreviewDialog()).not.toBeNull();
    document.body.replaceChildren(el("p", { text: "" }));
    expect(findPreviewDialog()).toBeNull();
  });
});

describe("collectDialogImages — lớp 1 (DOM dialog shell)", () => {
  beforeEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

  it("sort theo số id i1 < i2 < i10; data: giữ nguyên", async () => {
    buildDialog((surface) => {
      surface.appendChild(el("div", { class: "ppeSg" }));
      const strip = surface.lastChild as Element;
      strip.appendChild(el("img", { id: "i2", src: "data:image/png;base64,AAAA" }));
      strip.appendChild(el("img", { id: "i10", src: "data:image/png;base64,BBBB" }));
      strip.appendChild(el("img", { id: "i1", src: "data:image/png;base64,CCCC" }));
    });
    expect(await collectDialogImages(deps)).toEqual([
      "data:image/png;base64,CCCC", "data:image/png;base64,AAAA", "data:image/png;base64,BBBB"
    ]);
  });

  it("blob:/http → fetch + FileReader → data URL (mô phỏng trang Office)", async () => {
    buildDialog((surface) => surface.appendChild(el("img", { id: "i1", src: "blob:https://owa.test/guid-xyz" })));
    const dialog = document.body.lastChild as Element;
    ((dialog.lastChild as Element)).appendChild(el("img", { id: "i2", src: "https://res.cdn.office.net/page1.png" }));
    const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => BLOB_PNG } as Response));
    const urls = await collectDialogImages({ fetchImpl: fetchImpl as unknown as typeof fetch, FileReaderCtor: FileReader });
    expect(urls).toHaveLength(2);
    expect(urls[0]?.startsWith("data:image/png;base64,")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("img không id vẫn đếm (thứ tự cuối) và src rỗng bỏ qua", async () => {
    buildDialog((surface) => surface.appendChild(el("img", { src: "data:image/png;base64,X" })));
    const dialog = document.body.lastChild as Element;
    ((dialog.lastChild as Element)).appendChild(el("img", { id: "i1", src: "" }));
    expect(await collectDialogImages(deps)).toEqual(["data:image/png;base64,X"]);
  });

  it("không dialog / không img / fetch fail → mảng rỗng không ném", async () => {
    document.body.replaceChildren(el("p", {})); // không dialog
    expect(await collectDialogImages(deps)).toEqual([]);
    buildDialog(() => undefined); // dialog không img
    expect(await collectDialogImages(deps)).toEqual([]);
    buildDialog((surface) => surface.appendChild(el("img", { src: "blob:https://owa.test/g" })));
    const fetchFail = vi.fn(async () => { throw new Error("blob cross-doc"); });
    expect(await collectDialogImages({ fetchImpl: fetchFail as unknown as typeof fetch, FileReaderCtor: FileReader })).toEqual([]);
  });
});

describe("describePreviewDialogLines — diagnostics M-2", () => {
  it("không dialog → thông báo; dialog có nếu src/img redact token", () => {
    document.body.replaceChildren(el("p", {}));
    expect(describePreviewDialogLines()).toEqual(["dialog surface: KHÔNG THẤY (dialog đóng hoặc chưa mở)"]);
    buildDialog((surface) => {
      surface.appendChild(el("iframe", { src: "about:blank" }));
      surface.appendChild(el("img", { id: "i1", src: "https://res.cdn.office.net/a/p1.png?usid=TOKEN&sig=ABC" }));
    });
    const lines = describePreviewDialogLines();
    expect(lines.some((line) => line.startsWith("dialog surface: THẤY"))).toBe(true);
    expect(lines.some((line) => line.includes("iframe#0 src=about:blank"))).toBe(true);
    expect(lines.join("\n")).not.toContain("TOKEN");
    expect(lines.join("\n")).not.toContain("sig=ABC");
    expect(lines.some((line) => line.includes("img#0 id=i1") && line.includes("p1.png"))).toBe(true);
  });
});
