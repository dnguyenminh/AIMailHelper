// src/shared/llm/call.ts — fetch wrapper dùng chung 6 adapter (TDD §3.2; FSD 5.2.0).
// Timeout: 15s test/list · 60s chat · stream không tổng-timeout (idle guardian ở panel).
// Retry CHỈ pre-first-chunk: 429 (Retry-After ưu tiên / 1→2→4s) · 5xx/529 (2→4→8s) ·
// timeout ERR-04 đúng 1 LẦN (FSD 5.2.0/TDD §9.2 — postJson/getJson chưa đọc body nên luôn pre-first-chunk).
import { AppError } from "../errors";
import { mapFetchError, mapHttpToErr } from "./errmap";
import type { ProviderId } from "./types";

const RETRY_DELAYS_429 = [1_000, 2_000, 4_000];
const RETRY_DELAYS_5XX = [2_000, 4_000, 8_000];
const TIMEOUT_RETRY_MAX = 1; // timeout retry ĐÚNG 1 LẦN (§9.2)

// Test seam (listModels không nhận opts theo LLMAdapter interface) — test ghi đè về [0,0,0] rồi restore.
export const retryDelaysConfig = {
  delays429: [...RETRY_DELAYS_429],
  delays5xx: [...RETRY_DELAYS_5XX]
};

export interface CallOptions {
  provider: ProviderId;
  timeoutMs?: number;
  signal?: AbortSignal;
  // override trong unit test (mặc định theo FSD 5.2.0); mảng rỗng = tắt retry.
  retryDelays?: number[];
}

function combineSignal(external: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal {
  const controller = new AbortController();
  const timer = timeoutMs !== undefined
    ? setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs)
    : undefined;
  const onExternalAbort = (): void => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  return wrapSignal(controller, timer, external, onExternalAbort);
}

function wrapSignal(controller: AbortController, timer: ReturnType<typeof setTimeout> | undefined, external: AbortSignal | undefined, onExternalAbort: () => void): AbortSignal {
  const raw = controller.signal as AbortSignal & { __cleanup?: () => void };
  raw.addEventListener("abort", () => {
    if (timer !== undefined) clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }, { once: true });
  return raw;
}

async function rawFetch(url: string, init: RequestInit, opts: CallOptions): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw mapFetchError(error, opts.provider);
  }
}

// ERR-04 (timeout/abort) + user CHƯA cancel + chưa retry lần nào → được retry (§9.2).
function isTimeoutRetry(error: unknown, opts: CallOptions, timeoutRetries: number): boolean {
  if (timeoutRetries >= TIMEOUT_RETRY_MAX) return false;
  if (opts.signal?.aborted) return false; // user cancel — KHÔNG retry
  return error instanceof AppError && error.code === "ERR-04";
}

// Mỗi attempt có signal + timer RIÊNG — timeout attempt 1 không làm attempt 2 reject ngay.
async function fetchOnce(method: string, url: string, headers: Record<string, string>, body: string | undefined, opts: CallOptions, timeoutRetries: number): Promise<Response> {
  const init: RequestInit = { method: method, headers: headers, signal: combineSignal(opts.signal, opts.timeoutMs) };
  if (body !== undefined) init.body = body;
  try {
    return await rawFetch(url, init, opts);
  } catch (error) {
    if (isTimeoutRetry(error, opts, timeoutRetries)) {
      return fetchOnce(method, url, headers, body, opts, timeoutRetries + 1); // retry đúng 1 lần
    }
    throw error;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

// Gemini 429: RetryInfo.retryDelay "17s" nằm trong body details (5.2.4) — peek body trước khi retry.
async function retryDelayFor(response: Response, attempt: number, opts: CallOptions): Promise<number | null> {
  const is429 = response.status === 429;
  const is5xx = response.status >= 500;
  if (!is429 && !is5xx) return null;
  const delays = opts.retryDelays ?? (is429 ? retryDelaysConfig.delays429 : retryDelaysConfig.delays5xx);
  if (attempt >= delays.length) return null;
  const header = response.headers.get("retry-after");
  if (header !== null && /^\d+$/.test(header)) return Number(header) * 1000;
  if (is429) {
    const body = await safeText(response);
    const match = /"retryDelay"\s*:\s*"(\d+)s"/.exec(body);
    if (match) return Number(match[1]) * 1000;
  }
  return delays[attempt] ?? 0;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// POST JSON + retry status-level + timeout-retry-1-lần (tất cả CHỈ pre-first-chunk — §9.2).
async function fetchWithStatusRetry(method: string, url: string, headers: Record<string, string>, body: string | undefined, opts: CallOptions): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchOnce(method, url, headers, body, opts, 0);
    if (response.ok) return response;
    const delay = await retryDelayFor(response, attempt, opts);
    if (delay === null) throw mapHttpToErr(response.status, await safeText(response), opts.provider);
    await sleep(delay);
  }
}

export async function postJson(url: string, headers: Record<string, string>, body: unknown, opts: CallOptions): Promise<Response> {
  return fetchWithStatusRetry("POST", url, headers, JSON.stringify(body), opts);
}

// GET JSON cho listModels (cùng mapping lỗi + chính sách retry).
export async function getJson(url: string, headers: Record<string, string>, opts: CallOptions): Promise<Response> {
  return fetchWithStatusRetry("GET", url, headers, undefined, opts);
}

export const CALL_TIMEOUT = { testConnection: 15_000, listModels: 15_000, chat: 60_000 } as const;
