// src/content/components/Panel/AnalysisView.tsx — hiển thị AnalysisResult 5 khía cạnh (FR-GD3-06)
// + badge màu theo importanceLabel (DESIGN-SYSTEM badge palette: cao=đỏ, trung-binh=vàng, thap=xanh).
import { t } from "../../../shared/i18n";
import type { AnalysisResult } from "../../../shared/types";

const BADGE_CLASS: Record<AnalysisResult["importanceLabel"], string> = {
  cao: "aimh-badge-high",
  "trung-binh": "aimh-badge-medium",
  thap: "aimh-badge-low"
};

const importanceText = (label: AnalysisResult["importanceLabel"]): string =>
  t("panel.analyze.importance." + label);

export function AnalysisView({ result }: { result: AnalysisResult }) {
  return (
    <div className="aimh-analysis">
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.summary")}</h4>
        <p className="aimh-text">{result.summary}</p>
      </section>
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.importance")}</h4>
        <p className="aimh-text">
          <span className={"aimh-badge " + BADGE_CLASS[result.importanceLabel]}>{importanceText(result.importanceLabel)}</span>
          <span className="aimh-score">{result.importanceScore}/100</span>
        </p>
      </section>
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.intent")}</h4>
        <p className="aimh-text">{result.intent}</p>
      </section>
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.actions")}</h4>
        {result.actions.length === 0 ? (
          <p className="aimh-text aimh-muted">{t("panel.analyze.none")}</p>
        ) : (
          <ul className="aimh-list">
            {result.actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.deadline")}</h4>
        <p className="aimh-text">{result.deadline ?? t("panel.analyze.none")}</p>
      </section>
      <section>
        <h4 className="aimh-heading">{t("panel.analyze.sentiment")}</h4>
        <p className="aimh-text">{result.sentiment}</p>
      </section>
    </div>
  );
}
