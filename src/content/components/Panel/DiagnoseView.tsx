// src/content/components/Panel/DiagnoseView.tsx — UC-09 (FR-GD4-06; EF-3).
// Chạy collectDiagnoseReport() khi user bấm Diagnose; report hiển thị textarea readonly để
// copy/tải gửi kèm bug report. KHÔNG tự gửi đi đâu — xuất thủ công (§7.3); cảnh báo EF-3.
import { useCallback, useState } from "react";
import { t } from "../../../shared/i18n";
import { collectDiagnoseReport } from "../../owa-adapter/diagnose";
import type { DiagnoseReport } from "../../owa-adapter/diagnose";

export function DiagnoseView(props: { onClose: () => void }): JSX.Element {
  const [report, setReport] = useState<DiagnoseReport | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback((): void => {
    setRunning(true);
    setCopied(false);
    void collectDiagnoseReport()
      .then(setReport)
      .finally(() => setRunning(false));
  }, []);

  const copy = useCallback((): void => {
    if (!report) return;
    void navigator.clipboard?.writeText(report.text).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  }, [report]);

  return (
    <div className="aimh-diagnose" role="region" aria-label={t("panel.diagnose.title")}>
      <p className="aimh-heading">{t("panel.diagnose.title")}</p>
      <div className="aimh-panel-actions">
        <button type="button" className="aimh-btn aimh-btn-primary" disabled={running} onClick={run}>
          {running ? t("panel.diagnose.running") : t("panel.diagnose.button")}
        </button>
        <button type="button" className="aimh-btn" disabled={report === null} onClick={copy}>{t("panel.diagnose.copy")}</button>
        <button type="button" className="aimh-btn" onClick={props.onClose}>{t("panel.diagnose.close")}</button>
      </div>
      {report !== null && (
        <>
          {report.truncated && <p className="aimh-note">{t("panel.diagnose.truncated")}</p>}
          <textarea className="aimh-input aimh-report" rows={10} readOnly value={report.text} onFocus={(e) => e.currentTarget.select()} />
          <p className="aimh-note">{t("panel.diagnose.privacy")}</p>
          {copied && <p className="aimh-note">{t("panel.diagnose.copied")}</p>}
        </>
      )}
    </div>
  );
}
