// src/shared/errors.ts — AppError + ERR-01..16 (TDD §4.2/§9.4; FSD §9.1 — user message qua i18nKey, BR-08).

export type ErrCode =
  | "ERR-01" // CORS
  | "ERR-02" // 401/403 — key sai
  | "ERR-03" // 429 rate limit
  | "ERR-04" // timeout
  | "ERR-05" // local/DNS fail
  | "ERR-06" // OWA DOM not found
  | "ERR-07" // stream đứt
  | "ERR-08" // storage quota/fail
  | "ERR-09" // compose/chèn fail
  | "ERR-10" // email rỗng (BR-14)
  | "ERR-11" // thiếu trường config
  | "ERR-12" // thiếu message-id (log)
  | "ERR-13" // thiếu i18n key
  | "ERR-14" // thiếu host permission (BR-05)
  | "ERR-15" // request bị từ chối (400/404/413/model sai — KHÔNG retry)
  | "ERR-16" // provider quá tải (5xx/529/503 — backoff)
  | "ERR-17"; // extension context invalidated (reload extension — F5 trang để phục hồi)

export class AppError extends Error {
  readonly code: ErrCode;
  readonly i18nKey: string; // render theo uiLanguage — KHÔNG BAO GIỜ chứa key/body (BR-08)
  readonly params?: Record<string, string>;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(
    code: ErrCode,
    i18nKey: string,
    params?: Record<string, string>,
    retryable = false,
    httpStatus?: number
  ) {
    super(i18nKey);
    this.name = "AppError";
    this.code = code;
    this.i18nKey = i18nKey;
    this.params = params;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

// i18nKey mặc định theo ERR code — panel render khi handler không gắn key riêng (§9.1).
export const DEFAULT_ERROR_I18N: Record<ErrCode, string> = {
  "ERR-01": "errors.corsBlocked",
  "ERR-02": "errors.invalidKey",
  "ERR-03": "errors.rateLimited",
  "ERR-04": "errors.timeout",
  "ERR-05": "errors.localProviderUnreachable",
  "ERR-06": "errors.owaNotFound",
  "ERR-07": "errors.streamInterrupted",
  "ERR-08": "errors.storageQuota",
  "ERR-09": "errors.insertFailed",
  "ERR-10": "errors.emptyEmail",
  "ERR-11": "errors.missingConfig",
  "ERR-12": "errors.missingMessageId",
  "ERR-13": "errors.missingI18nKey",
  "ERR-14": "errors.hostPermission",
  "ERR-15": "errors.badRequest",
  "ERR-16": "errors.providerOverloaded",
  "ERR-17": "errors.reloadRequired"
};

// Stub GĐ1 — handler/khả năng chưa triển khai trả ERR-15 kèm GĐ hoàn thành (khách hàng: router).
export function notImplementedError(phase: string): AppError {
  return new AppError("ERR-15", "errors.notImplemented", { phase });
}
