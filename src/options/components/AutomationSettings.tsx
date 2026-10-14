// src/options/components/AutomationSettings.tsx — auto-mode toggle (GĐ1 stub → GĐ6; BR-02/BR-13).
// GĐ2: toggle + dialog xác nhận cảnh báo (EF-3); rules editor; batchSize/throttle.
// Copy cảnh báo sẵn theo FSD §10.1 — SR-11 (GĐ2: bổ sung disclosure "email mới gửi tới LLM").
import { t } from "../../shared/i18n";

export function AutomationSettings() {
  return (
    <div className="form-stub">
      <label className="field row">
        <input type="checkbox" disabled />
        <span>{t("options.automation.autoMode")}</span>
      </label>
      <p className="warning">{t("options.automation.autoModeWarning")}</p>
      <label className="field">
        <span>{t("options.automation.batchSize")}</span>
        <input type="number" min={1} max={50} disabled />
      </label>
      <p className="note">{t("options.comingSoon", { phase: "GĐ6" })}</p>
    </div>
  );
}
