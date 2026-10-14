// src/shared/llm/errmap.ts — map HTTP/provider error → AppError ERR-01..16 (TDD §9.4; FSD 5.2.0/5.2.x).
// Message provider đi qua sanitizeProviderMessage (SR-03 redactSecrets + cap 500 — §8.8, BR-08).
import { AppError } from "../errors";
import type { ErrCode } from "../errors";
import { redactSecrets, sanitizeProviderMessage } from "../redact";
import type { ProviderId } from "./types";

const MAX_DETAIL = 500;

function appError(code: ErrCode, i18nKey: string, detail: string, retryable = false, httpStatus?: number, extra?: Record<string, string>): AppError {
  const params = detail.length > 0 ? { ...extra, detail: detail.slice(0, MAX_DETAIL) } : extra;
  return new AppError(code, i18nKey, params, retryable, httpStatus);
}

// Chuỗi báo hiệu max_completion_tokens không được model/server hỗ trợ → fallback max_tokens (5.2.1 TA note).
const MAX_TOKENS_UNSUPPORTED = /max_completion_tokens|unsupported.*parameter|use.*max_tokens/i;

export function isMaxTokensUnsupported(error: unknown): boolean {
  return error instanceof AppError && error.httpStatus === 400 && MAX_TOKENS_UNSUPPORTED.test(error.params?.["detail"] ?? "");
}

// CORS/TypeError fetch → ERR-01 (cloud) hoặc ERR-05 (local — 5.2.6); Abort → ERR-04 timeout (§9.1).
export function mapFetchError(error: unknown, provider: ProviderId): AppError {
  if (error instanceof AppError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new AppError("ERR-04", "errors.timeout");
  }
  if (provider === "local") return new AppError("ERR-05", "errors.localProviderUnreachable");
  return new AppError("ERR-01", "errors.corsBlocked");
}

// HTTP status + body → AppError. Provider-specific trước (Gemini 400 DISC-2, Azure content_filter,
// Anthropic 529, local 403 OLLAMA_ORIGINS — FSD 5.2.2/5.2.3/5.2.4/5.2.6), sau đó mapping chung 5.2.0.
export function mapHttpToErr(status: number, bodyText: string, provider: ProviderId): AppError {
  const detail = sanitizeProviderMessage(bodyText);
  if (provider === "local" && status === 403) {
    return appError("ERR-05", "errors.localOriginsHint", detail, false, status);
  }
  if (provider === "gemini" && status === 400) {
    // DISC-2: API_KEY_INVALID (status field hoặc message thật "API key not valid…") → ERR-02; còn lại ERR-15
    if (/API_KEY_INVALID|API key not valid/i.test(bodyText)) {
      return appError("ERR-02", "errors.invalidKey", detail, false, status);
    }
    return appError("ERR-15", "errors.badRequest", detail, false, status); // INVALID_ARGUMENT — DISC-2
  }
  if (provider === "azure" && status === 400 && bodyText.includes("content_filter")) {
    return appError("ERR-15", "errors.contentFilter", detail, false, status);
  }
  if (status === 401 || status === 403) return appError("ERR-02", "errors.invalidKey", detail, false, status);
  if (status === 429) return appError("ERR-03", "errors.rateLimited", detail, true, status);
  if (status === 404) return appError("ERR-15", "errors.badRequest", detail, false, status);
  if (status === 413) return appError("ERR-15", "errors.tooLarge", detail, false, status);
  if (status === 400) return appError("ERR-15", "errors.badRequest", detail, false, status);
  if (status >= 500 || status === 529) return appError("ERR-16", "errors.providerOverloaded", detail, true, status);
  return appError("ERR-15", "errors.badRequest", detail, false, status);
}

// finishReason bất thường trong response THÀNH CÔNG (Azure content_filter — 5.2.2; Gemini SAFETY — 5.2.4).
export function finishReasonError(finishReason: string): AppError | null {
  if (finishReason === "content_filter") return new AppError("ERR-15", "errors.contentFilter");
  if (finishReason === "SAFETY") return new AppError("ERR-15", "errors.safetyBlocked");
  return null;
}

// listModels không hỗ trợ (Azure — BR-17; ModelPicker ẩn fetch).
export function modelsNotSupportedError(): AppError {
  return new AppError("ERR-15", "errors.modelsNotSupported");
}

// Redact mọi chuỗi trước khi đưa vào log/console (BR-08 — SR-03 lớp cuối).
export function redactForLog(text: string): string {
  return redactSecrets(text);
}
