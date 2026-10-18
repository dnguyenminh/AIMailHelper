// src/shared/attachments/extract.ts — binary attachment → TEXT cho LLM (UAT 18/10, Plan A).
// Định dạng: txt/csv/md/log (utf-8), docx (word/document.xml), xlsx (sharedStrings + sheets),
// pdf (pdf.js text layer — lazy dynamic import, chỉ khi gặp PDF). Chạy trong Service Worker
// (DecompressionStream + atob có sẵn). Cap: MAX_CHARS/file — bảo vệ chi phí LLM (BR-14 tinh thần).
import { readZipEntries } from "./zip";

export const MAX_ATTACHMENT_CHARS = 20_000;
const MAX_PDF_PAGES = 40;
const MAX_XLSX_ROWS = 2_000;
// doc/xls (Word/Excel CŨ — OLE binary) nằm trong danh sách để AI ít nhất được BÁO CÓ file:
// OWA render qua Office Online (iframe cross-origin) — bytes không lấy được → placeholder.
const SUPPORTED = ["txt", "csv", "md", "log", "doc", "xls", "docx", "xlsx", "pdf"];

export function isSupportedAttachment(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED.includes(ext);
}

function cap(text: string): string {
  return text.length > MAX_ATTACHMENT_CHARS ? text.slice(0, MAX_ATTACHMENT_CHARS) + "…[cắt]" : text;
}

function decodeEntities(xml: string): string {
  return xml
    .replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "\"")
    .replace(/'/g, "'").replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&/g, "&");
}

// DOCX: word/document.xml — mỗi </w:p> = 1 dòng; text trong <w:t>…</w:t>.
function docxToText(xml: string): string {
  const paragraphs = xml.split("</w:p>").map((chunk) =>
    decodeEntities(Array.from(chunk.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((m) => m[1]).join(""))
  );
  return paragraphs.filter((p) => p.trim().length > 0).join("\n");
}

// XLSX: sharedStrings.xml (chuỗi dùng chung) + từng sheet — mỗi <row> = 1 dòng, cell join " | ".
function xlsxToText(entries: Map<string, Uint8Array>): string {
  const shared = entries.get("xl/sharedStrings.xml");
  const strings: string[] = [];
  if (shared) {
    const xml = decodeEntities(new TextDecoder().decode(shared));
    for (const si of xml.matchAll(/<si>[\s\S]*?<\/si>/g)) {
      strings.push(Array.from(si[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => m[1]).join(""));
    }
  }
  const sheets = Array.from(entries.keys()).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const parts: string[] = [];
  for (const sheetName of sheets) {
    const xml = decodeEntities(new TextDecoder().decode(entries.get(sheetName) as Uint8Array));
    const lines: string[] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowXml = rowMatch[1] ?? "";
      const cells: string[] = [];
      for (const cellMatch of rowXml.matchAll(/<c[^>]*?>([\s\S]*?)<\/c>/g)) {
        const cellXml = cellMatch[1] ?? "";
        const typeMatch = cellMatch[0].match(/t="(\w+)"/); // attr nằm ở THẺ MỞ — tìm trên cả cell
        const value = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const inline = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (typeMatch?.[1] === "s" && value) cells.push(strings[Number(value[1])] ?? "");
        else if (typeMatch?.[1] === "inlineStr" && inline) cells.push(inline[1] ?? "");
        else if (value) cells.push(value[1] ?? "");
      }
      if (cells.some((c) => c.length > 0)) lines.push(cells.join(" | "));
      if (lines.length >= MAX_XLSX_ROWS) break;
    }
    if (lines.length > 0) parts.push(`[${sheetName.replace("xl/worksheets/", "")}]\n` + lines.join("\n"));
  }
  return parts.join("\n\n");
}

// PDF: pdf.js legacy (fake worker — cùng thread SW). Text layer từng trang, cap số trang.
let pdfjsPromise: Promise<{ extract: (bytes: Uint8Array) => Promise<string> }> | null = null;

async function pdfExtractor(): Promise<{ extract: (bytes: Uint8Array) => Promise<string> }> {
  if (pdfjsPromise === null) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return {
        extract: async (bytes: Uint8Array): Promise<string> => {
          const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
          const pages: string[] = [];
          const total = Math.min(doc.numPages, MAX_PDF_PAGES);
          for (let p = 1; p <= total; p += 1) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
          }
          await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.(); // v6 types không khai báo destroy
          return pages.join("\n");
        }
      };
    })();
  }
  return pdfjsPromise;
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Entry point — sniff MAGIC BYTES trước (server có thể convert .doc → PDF): %PDF → pdf;
// PK\x03\x04 → ZIP (docx/xlsx); còn lại → text utf-8 (txt/csv); OLE binary (.doc/.xls cũ,
// signature D0 CF 11 E0) → throw "định dạng cũ" (caller ghi placeholder cho AI biết).
export async function extractAttachmentText(name: string, base64: string): Promise<string> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED.includes(ext)) throw new Error("attachment: định dạng không hỗ trợ ." + ext);
  const bytes = bytesFromBase64(base64);
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic === "%PDF") return cap(await (await pdfExtractor()).extract(bytes));
  if (magic === "PK\x03\x04") {
    const entries = await readZipEntries(bytes);
    if (entries.has("word/document.xml")) {
      return cap(docxToText(new TextDecoder().decode(entries.get("word/document.xml") as Uint8Array)));
    }
    return cap(xlsxToText(entries));
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error("attachment: Word/Excel cũ (OLE binary) — Office Online render, không trích được text");
  }
  return cap(new TextDecoder().decode(bytes));
}
