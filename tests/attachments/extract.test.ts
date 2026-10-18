// tests/attachments/extract.test.ts — Plan A (UAT 18/10): binary attachment → text.
// Fixture ZIP dựng thủ công (stored + deflate qua node zlib) — không cần file ngoài.
// PDF path: mock pdfjs-dist (dynamic import bị vi.mock chặn được) — verify dispatch + pages.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";
import { DecompressionStream as NodeDecompressionStream } from "node:stream/web";
import { readZipEntries } from "../../src/shared/attachments/zip";
import { extractAttachmentText, MAX_ATTACHMENT_CHARS } from "../../src/shared/attachments/extract";

// jsdom thiếu DecompressionStream — polyfill từ Node (runtime thật là Chrome 103+ có sẵn).
(globalThis as { DecompressionStream?: unknown }).DecompressionStream =
  (globalThis as { DecompressionStream?: unknown }).DecompressionStream ?? NodeDecompressionStream;

// Tạo ZIP bytes hợp lệ: entry method 0 (stored) hoặc 8 (deflate).
function buildZip(entries: { name: string; data: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf-8");
    const method = entry.deflate === true ? 8 : 0;
    const data = entry.deflate === true ? deflateRawSync(entry.data) : entry.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    const localChunk = Buffer.concat([local, nameBytes, data]);
    locals.push(localChunk);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBytes]));
    offset += localChunk.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function b64(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

const DOCX_XML = `<?xml version="1.0"?><w:document><w:body>` +
  `<w:p><w:r><w:t>Quyết định: phê duyệt ngân sách</w:t></w:r></w:p>` +
  `<w:p><w:r><w:t>Số tiền < 500 triệu</w:t></w:r></w:p>` +
  `</w:body></w:document>`;
const DOCX_ZIP = buildZip([
  { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
  { name: "word/document.xml", data: Buffer.from(DOCX_XML), deflate: true }
]);

const XLSX_SHARED = `<sst><si><t>Tên</t></si><si><t>Số tiền</t></si><si><t>Nguyễn Văn A</t></si></sst>`;
const XLSX_SHEET = `<worksheet><sheetData>` +
  `<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>` +
  `<row><c t="s"><v>2</v></c><c><v>450000000</v></c></row>` +
  `</sheetData></worksheet>`;
const XLSX_ZIP = buildZip([
  { name: "xl/sharedStrings.xml", data: Buffer.from(XLSX_SHARED), deflate: true },
  { name: "xl/worksheets/sheet1.xml", data: Buffer.from(XLSX_SHEET), deflate: true }
]);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("readZipEntries — ZIP tối giản (stored + deflate)", () => {
  it("đọc đủ entry, giải nén deflate-raw qua DecompressionStream", async () => {
    const entries = await readZipEntries(new Uint8Array(DOCX_ZIP));
    expect(entries.has("word/document.xml")).toBe(true);
    expect(new TextDecoder().decode(entries.get("word/document.xml") as Uint8Array)).toContain("phê duyệt ngân sách");
  });

  it("file không phải ZIP (không EOCD) → throw", async () => {
    await expect(readZipEntries(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow("EOCD");
  });
});

describe("extractAttachmentText — dispatch theo extension", () => {
  it("txt: decode UTF-8 trực tiếp", async () => {
    const text = await extractAttachmentText("ghi-chu.txt", b64(Buffer.from("Họp ngày thứ Sáu, mang báo cáo", "utf-8")));
    expect(text).toBe("Họp ngày thứ Sáu, mang báo cáo");
  });

  it("docx: trích <w:t> theo đoạn + decode entity", async () => {
    const text = await extractAttachmentText("quyet-dinh.docx", b64(DOCX_ZIP));
    expect(text).toContain("Quyết định: phê duyệt ngân sách");
    expect(text).toContain("Số tiền < 500 triệu"); // entity < đã decode
    expect(text).toContain("\n"); // 2 đoạn riêng dòng
  });

  it("xlsx: sharedStrings resolve + cell số, row join ' | '", async () => {
    const text = await extractAttachmentText("ngan-sach.xlsx", b64(XLSX_ZIP));
    expect(text).toContain("[sheet1.xml]");
    expect(text).toContain("Tên | Số tiền");
    expect(text).toContain("Nguyễn Văn A | 450000000");
  });

  it("định dạng không hỗ trợ (.exe) → throw, caller bỏ qua", async () => {
    await expect(extractAttachmentText("virus.exe", b64(Buffer.from("MZ")))).rejects.toThrow("không hỗ trợ");
  });

  it("cap MAX_ATTACHMENT_CHARS — text dài bị cắt có dấu hiệu [cắt]", async () => {
    const long = "x".repeat(MAX_ATTACHMENT_CHARS + 5000);
    const text = await extractAttachmentText("big.csv", b64(Buffer.from(long, "utf-8")));
    expect(text.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CHARS + 10);
    expect(text).toContain("[cắt]");
  });

  it("pdf: dispatch sang pdfjs (mock) — text từng trang join", async () => {
    vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (n: number) => ({
            getTextContent: async () => ({ items: [{ str: "Trang " + n + " noi dung" }] })
          }),
          destroy: async () => undefined
        })
      })
    }));
    const text = await extractAttachmentText("hop-dong.pdf", b64(Buffer.from("%PDF-1.4 fake")));
    expect(text).toContain("Trang 1 noi dung");
    expect(text).toContain("Trang 2 noi dung");
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
  });
});
