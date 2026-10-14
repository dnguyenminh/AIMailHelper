// src/shared/llm/sse.ts — parser SSE chuẩn hóa dùng chung (TDD §3.2; FSD 5.2.x).
// tolerant mode (5.2.5): connection close = kết thúc bình thường; block lỗi → bỏ qua, không fail stream.
// parseNdjson: Plan B cho Ollama native /api/chat (5.2.6) — giữ sẵn, KHÔNG dùng MVP.

export interface SseEvent {
  event?: string; // tên event (Anthropic "content_block_delta"…); undefined = chỉ data
  data: string;
}

const BLOCK_SEPARATOR = /\r?\n\r?\n/;

function parseBlock(raw: string): SseEvent | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(":")) continue; // SSE comment/keep-alive — bỏ qua
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  return { event: event, data: dataLines.join("\n") };
}

// Chuẩn hóa SSE: mỗi block cách nhau bởi dòng trống; block cuối thiếu separator vẫn được xử lý.
// Tolerant (5.2.5): block lỗi/comment → bỏ qua tự nhiên (parseBlock null); JSON hỏng do safeJsonParse xử lý.
export async function* parseSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) throw new Error("response body is null");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let match = BLOCK_SEPARATOR.exec(buffer); match; match = BLOCK_SEPARATOR.exec(buffer)) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const parsed = parseBlock(block);
        if (parsed) yield parsed; // block lỗi/comment → bỏ qua (tolerant — 5.2.5)
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim().length > 0) {
    const parsed = parseBlock(buffer);
    if (parsed) yield parsed; // event cuối không có dòng trống kết thúc (tolerant — 5.2.5)
  }
}

// Plan B 5.2.6 — NDJSON Ollama native: mỗi dòng 1 JSON; dòng cuối "done":true.
export async function* parseNdjson(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("response body is null");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) yield line;
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  const tail = buffer.trim();
  if (tail.length > 0) yield tail;
}

// JSON.parse an toàn: tolerant → trả null thay vì throw (dòng hỏng bỏ qua — 5.2.5).
export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
