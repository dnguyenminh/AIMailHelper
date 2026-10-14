// src/content/components/Panel/ErrorBanner.tsx — banner lỗi (§9.1): i18nKey render theo uiLanguage
// (BR-08 — không chứa key), nút Thử lại (ERR-07/retryable), EF-6 hiển thị raw + cảnh báo.
import { t } from "../../../shared/i18n";
import type { AnalysisError } from "../../modules/analyze";

export function ErrorBanner({ error, onRetry }: { error: AnalysisError; onRetry: () => void }) {
  return (
    <div className="aimh-error" role="alert">
      <p className="aimh-error-msg">{t(error.i18nKey, error.params)}</p>
      {error.ef6Raw !== undefined && (
        <pre className="aimh-error-raw">{t("panel.analyze.rawWarning") + "\n" + error.ef6Raw}</pre>
      )}
      {error.retryable && (
        <button type="button" className="aimh-btn" onClick={onRetry}>{t("panel.analyze.retry")}</button>
      )}
    </div>
  );
}
