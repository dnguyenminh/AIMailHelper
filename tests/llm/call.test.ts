// tests/llm/call.test.ts — CR-3 (FSD 5.2.0 / TDD §9.2): timeout (ERR-04) retry ĐÚNG 1 LẦN pre-first-chunk.
// postJson/getJson chưa đọc body → luôn pre-first-chunk; user cancel (signal aborted) → KHÔNG retry.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../../src/shared/llm/call";
import { FIXTURE_KEYS, jsonResponse, queueResponse, stubFetch } from "./helpers";

const URL_OPENAI = "https://api.openai.com/v1/chat/completions";

// jsdom: DOMException KHÔNG instanceof Error → mapFetchError không đọc được .name.
// Dùng Error thường + name — khớp contract mapFetchError (error instanceof Error ? error.name : "").
function fetchError(name: "TimeoutError" | "AbortError"): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("postJson — retry timeout 1 lần pre-first-chunk (CR-3)", () => {
  it("timeout lần 1 → retry đúng 1 lần → thành công (đúng 2 fetch calls)", async () => {
    const { mock } = stubFetch();
    mock.mockImplementationOnce(async () => {
      throw fetchError("TimeoutError");
    });
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    const response = await postJson(URL_OPENAI, { Authorization: "Bearer " + FIXTURE_KEYS.openai }, { model: "gpt-4o-mini" }, { provider: "openai", timeoutMs: 100 });
    expect(response.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("timeout lần 2 → ERR-04, KHÔNG retry nữa (vẫn đúng 2 fetch calls)", async () => {
    const { mock } = stubFetch();
    mock.mockImplementation(async () => {
      throw fetchError("TimeoutError");
    });
    await expect(
      postJson(URL_OPENAI, {}, { model: "gpt-4o-mini" }, { provider: "openai", timeoutMs: 100 })
    ).rejects.toMatchObject({ code: "ERR-04", i18nKey: "errors.timeout" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("user cancel (signal đã aborted) → KHÔNG retry (1 fetch call)", async () => {
    const { mock } = stubFetch();
    mock.mockImplementation(async () => {
      throw fetchError("AbortError");
    });
    const controller = new AbortController();
    controller.abort(); // §6.2 #5 — cancel từ Port phải đi thẳng ERR-04
    await expect(
      postJson(URL_OPENAI, {}, { model: "gpt-4o-mini" }, { provider: "openai", timeoutMs: 100, signal: controller.signal })
    ).rejects.toMatchObject({ code: "ERR-04" });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

// GĐ5 (TC-118 gốc — tái dùng call.ts, chứng cứ §9.2): 429 Retry-After ưu tiên; không header →
// delays 1s→2s→4s; 5xx → 2s→4s→8s; tất cả CHỈ pre-first-chunk. Fake timers đo đúng mốc chờ.
describe("postJson — backoff 429/5xx (GĐ5 tái dùng — TC-118)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("429 Retry-After: 2 → chờ đúng 2000ms rồi retry thành công (2 fetch calls)", async () => {
    vi.useFakeTimers();
    try {
      const { mock } = stubFetch();
      mock.mockImplementationOnce(async () => new Response("{}", { status: 429, headers: { "Retry-After": "2" } }));
      queueResponse(mock, jsonResponse({ choices: [{ message: { content: "ok" } }] }));
      const pending = postJson(URL_OPENAI, {}, { model: "gpt-4o-mini" }, { provider: "openai" });
      await vi.advanceTimersByTimeAsync(1999); // chưa đủ 2s
      expect(mock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); // đủ 2s → attempt 2
      const response = await pending;
      expect(response.ok).toBe(true);
      expect(mock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("429 không Retry-After → backoff 1s→2s→4s (3 lần) rồi ERR-03 (4 fetch calls)", async () => {
    vi.useFakeTimers();
    try {
      const { mock } = stubFetch();
      mock.mockImplementation(async () => new Response("{}", { status: 429 }));
      const pending = postJson(URL_OPENAI, {}, { model: "gpt-4o-mini" }, { provider: "openai" });
      const pendingExpect = expect(pending).rejects.toMatchObject({ code: "ERR-03", retryable: true });
      await vi.advanceTimersByTimeAsync(1000); // 1
      expect(mock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000); // 2
      expect(mock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(4000); // 3 → hết delays
      await pendingExpect;
      expect(mock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("5xx → backoff 2s→4s→8s rồi ERR-16 (retryable — §9.2)", async () => {
    vi.useFakeTimers();
    try {
      const { mock } = stubFetch();
      mock.mockImplementation(async () => new Response("{}", { status: 500 }));
      const pending = postJson(URL_OPENAI, {}, { model: "gpt-4o-mini" }, { provider: "openai" });
      const pendingExpect = expect(pending).rejects.toMatchObject({ code: "ERR-16", retryable: true });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(4000);
      expect(mock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(8000);
      await pendingExpect;
      expect(mock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
