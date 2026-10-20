// src/content/components/Panel/CopilotResult.tsx — GĐ-B 20/10: hiển thị lời Copilot TRẢ NGUYÊN VĂN.
// result=null theo design — AnalysisResult cap summary ≤1000 ký tự (§8.11) không chứa được toàn văn.
import { t } from "../../../shared/i18n";

export function CopilotResult({ raw }: { raw: string }) {
  return (
    <div className="aimh-copilot-result">
      <p className="aimh-note">{t("panel.analyze.copilotSource")}</p>
      <pre className="aimh-stream">{raw}</pre>
    </div>
  );
}
