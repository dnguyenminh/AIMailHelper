// src/content/components/Panel/Panel.tsx — Panel AI shell trong Shadow DOM (TDD §3.6).
// GĐ1: shell placeholder. Views thật (AnalysisView/ReplyComposer/DigestView/QueueView) ở GĐ3–6.
import { t } from "../../../shared/i18n";

export function Panel() {
  return (
    <div className="aimh-panel" role="complementary" aria-label="AIMailHelper">
      <p className="aimh-panel-title">{t("panel.title")}</p>
      <p className="aimh-panel-note">{t("panel.comingSoon", { phase: "GĐ3" })}</p>
    </div>
  );
}
