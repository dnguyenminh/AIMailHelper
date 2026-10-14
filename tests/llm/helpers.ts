// tests/llm/helpers.ts — fixture SSE/JSON + fetch mock helper dùng chung cho adapter tests (TDD §12.1).
// Fixture key ĐỊNH DẠNG thật từng provider (SR-03 test matrix) — file nằm ngoài src/ để không vi phạm
// audit BR-16 (không hard-code key trong src/).
import { vi } from "vitest";

export const FIXTURE_KEYS = {
  openai: "sk-proj-abc123def456ghi789jkl", // sk-… (≥10 chars sau sk-)
  anthropic: "sk-ant-api03-xyz456uvw789rst012", // sk-ant-…
  gemini: "AIzaSyA0123456789abcdefghijklmnopqrstuv", // AIza + 35 chars
  azure: "b3c4d5e6f708192a3b4c5d6e7f8091a2" // hex-32
} as const;

export function sseResponse(blocks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const block of blocks) controller.enqueue(encoder.encode(block));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init });
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status: status, headers: { "Content-Type": "application/json" } });
}

export function errorResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: status, headers: { "Content-Type": "application/json" } });
}

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// stubGlobal fetch; calls[i] = {url, method, headers, body-parsed} — body {} cho GET (không dùng assert body GET).
export function stubFetch(): { mock: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers = normalizeHeaders(init?.headers);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: headers, body: body });
    const queued = mockQueue.shift();
    if (!queued) throw new Error("no queued fetch response for " + String(url));
    return queued;
  }) as ReturnType<typeof vi.fn> & { __queue?: unknown };
  const mockQueue: Response[] = [];
  const original = mock;
  const wrapped = original as unknown as { mockResolvedValueOnce: unknown };
  void wrapped;
  // queue API gọn: queueResponse trước khi gọi
  (mock as unknown as { queue: (r: Response) => void }).queue = (response: Response): void => {
    mockQueue.push(response);
  };
  (mock as unknown as { __calls: FetchCall[] }).__calls = calls;
  vi.stubGlobal("fetch", mock);
  return { mock: mock, calls: calls };
}

export function queueResponse(mock: ReturnType<typeof vi.fn>, response: Response): void {
  (mock as unknown as { queue: (r: Response) => void }).queue(response);
}

export function callsOf(mock: ReturnType<typeof vi.fn>): FetchCall[] {
  return (mock as unknown as { __calls: FetchCall[] }).__calls;
}

// noUncheckedIndexedAccess-safe accessors cho tests: nthCall(mock, 0) === call đầu tiên.
export function nthCall(mock: ReturnType<typeof vi.fn>, index: number): FetchCall {
  const call = callsOf(mock)[index];
  if (call === undefined) throw new Error("no fetch call #" + index + " recorded");
  return call;
}

export function firstCall(mock: ReturnType<typeof vi.fn>): FetchCall {
  return nthCall(mock, 0);
}

function normalizeHeaders(input: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;
  if (Array.isArray(input)) {
    for (const [key, value] of input) result[key] = value;
    return result;
  }
  const raw = input as Record<string, string>;
  for (const [key, value] of Object.entries(raw)) result[key] = value;
  return result;
}
