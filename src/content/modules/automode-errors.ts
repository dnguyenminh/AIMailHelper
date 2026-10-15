// src/content/modules/automode-errors.ts — map lỗi → lastError shape (UAT-1; tách khỏi
// automode.ts để giữ ≤200 dòng/file). KHÔNG log payload email (BR-08).
import { AppError } from "../../shared/errors";

export interface AutoModeErrorInfo {
  code: string;
  i18nKey: string;
  params?: Record<string, string>;
}

export function toAutoModeError(error: unknown): AutoModeErrorInfo {
  if (error instanceof AppError) return { code: error.code, i18nKey: error.i18nKey, params: error.params };
  console.error("[AIMH][automode] unexpected error:", error); // KHÔNG log payload email (BR-08)
  return { code: "ERR-15", i18nKey: "errors.badRequest" };
}
