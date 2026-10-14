// src/options/components/TestConnection.tsx — nút Test Connection + {ok, message, latencyMs} (GĐ2; FR-GD2-06).
// Disable khi đang gọi; spinner copy ≤15s (hard timeout ở adapter §6.1 #4); lỗi → i18nKey + detail đã redact.
import { useState } from "react";
import type { AppError } from "../../shared/errors";
import type { LLMConfig } from "../../shared/llm/types";
import { sendMessage } from "../../shared/messaging";
import { t } from "../../shared/i18n";

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

export function TestConnection(props: { draft: LLMConfig | null; hasStoredConfig: boolean }): JSX.Element {
  const { draft, hasStoredConfig } = props;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [failure, setFailure] = useState<AppError | null>(null);

  const run = async (): Promise<void> => {
    if (!draft) return;
    setTesting(true);
    setResult(null);
    setFailure(null);
    try {
      setResult(await sendMessage<TestResult>("TEST_CONNECTION", { config: draft }));
    } catch (error) {
      setFailure(toAppError(error)); // error envelope: code + i18nKey + params.detail (đã redact — SR-03)
    } finally {
      setTesting(false);
    }
  };

  const disabled = testing || (!draft?.model && !hasStoredConfig);

  return (
    <div className="test-connection">
      <button type="button" disabled={disabled} onClick={() => void run()}>
        {t("options.provider.testConnection")}
      </button>
      {testing && <p className="note" role="status">{t("options.test.testing")}</p>}
      {result && result.ok && (
        <p className="note ok" role="status">✓ {result.message} ({result.latencyMs}ms)</p>
      )}
      {failure && (
        <p className="warning" role="alert">
          {t("options.test.failed")} {renderError(failure)}
        </p>
      )}
      {!draft && <p className="note">{t("options.test.needConfig")}</p>}
    </div>
  );
}

function toAppError(error: unknown): AppError {
  return error as AppError; // sendMessage đã ném AppError từ error envelope (messaging.ts)
}

// Render theo uiLanguage: t(i18nKey, params) + dòng chi tiết provider (đã redactSecrets — BR-08/SR-03).
function renderError(error: AppError): string {
  const message = t(error.i18nKey, error.params ?? {});
  const detail = error.params?.["detail"];
  return detail ? message + " — " + detail : message;
}
