// src/shared/attachments/zip.ts — ZIP reader tối giản (UAT 18/10 — đọc docx/xlsx là ZIP).
// Chỉ hỗ trợ method 0 (stored) + 8 (deflate-raw) — đủ cho Office Open XML. Dùng
// DecompressionStream có sẵn (Chrome 103+/SW) — KHÔNG thêm thư viện (CSP/BR-16 an toàn).
const CEN_SIG = 0x02014b50;
const MAX_ENTRIES = 512;

function findEocd(bytes: Uint8Array): number | null {
  const min = Math.max(0, bytes.length - 66_000);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const d = bytes[i + 3];
    if (a === 0x50 && b === 0x4b && c === 0x05 && d === 0x06) return i;
  }
  return null;
}

function u16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writeDone = writer.write(bytes as unknown as Parameters<typeof writer.write>[0]).then(() => writer.close());
  const output: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (chunk.value) output.push(chunk.value);
  }
  await writeDone;
  const total = output.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let position = 0;
  for (const part of output) { result.set(part, position); position += part.length; }
  return result;
}

function slice(bytes: Uint8Array, start: number, end: number): Uint8Array {
  return bytes.subarray(start, end);
}

const decoder = new TextDecoder("utf-8");

// Đọc TẤT CẢ entry trong ZIP → Map<tên, bytes>. Parse central directory (kích thước đáng tin
// cả khi local header dùng data descriptor — bit 3). Entry lỗi → bỏ qua, không hủy cả file.
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const eocd = findEocd(bytes);
  if (eocd === null) throw new Error("zip: EOCD not found");
  const count = Math.min(u16(bytes, eocd + 10), MAX_ENTRIES);
  let offset = u32(bytes, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, offset) !== CEN_SIG) break;
    const method = u16(bytes, offset + 10);
    const compSize = u32(bytes, offset + 20);
    const nameLen = u16(bytes, offset + 28);
    const extraLen = u16(bytes, offset + 30);
    const commentLen = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const name = decoder.decode(slice(bytes, offset + 46, offset + 46 + nameLen));
    const localNameLen = u16(bytes, localOffset + 26);
    const localExtraLen = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    try {
      const raw = slice(bytes, dataStart, dataStart + compSize);
      entries.set(name, method === 0 ? raw : await inflateRaw(raw));
    } catch {
      /* entry hỏng — bỏ qua (batch không gián đoạn) */
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
