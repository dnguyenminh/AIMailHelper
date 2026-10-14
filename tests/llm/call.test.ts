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
