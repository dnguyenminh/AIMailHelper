// src/content/components/Panel/Panel.tsx — Panel AI GĐ3+GĐ4 (TDD §3.6; FR-GD3-05/06, FR-GD4-01..06).
// Shadow DOM (đã mount bởi index.tsx): nút "AI phân tích" + "Dừng", consent banner lần đầu
// analyze (SR-18), streaming raw, AnalysisView structured + badge, ErrorBanner (ERR + Thử lại),
// ReplySection UC-02 (soạn trả lời — khi analyze done) + DiagnoseView UC-09.
import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, setCache } from "../../../shared/cache-store";
import { t } from "../../../shared/i18n";
import { createAnalyzeController } from "../../modules/analyze";
import type { AnalysisUiState } from "../../modules/analyze";
import { AnalysisView } from "./AnalysisView";
import { DiagnoseView } from "./DiagnoseView";
import { ErrorBanner } from "./ErrorBanner";
import { ReplySection } from "./ReplySection";

const CONSENT_KEY = "panel.consentShown"; // SR-18 — ghi nhận đã hiển thị
const EXTERNAL_ANALYZE_EVENT = "aimh:analyze"; // nút toolbar inject (owa-adapter) bắn event này

const isTrue = (value: unknown): true | null => (value === true ? true : null);

export function Panel() {
  const [state, setState] = useState<AnalysisUiState>({ status: "idle", raw: "", result: null, error: null });
  const [consentVisible, setConsentVisible] = useState(false);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createAnalyzeController> | null>(null);

  useEffect(() => {
    controllerRef.current = createAnalyzeController(setState);
    void getCache(CONSENT_KEY, isTrue).then((shown) => setConsentVisible(shown !== true));
    const onExternal = (): void => {
      void controllerRef.current?.start();
    };
    document.addEventListener(EXTERNAL_ANALYZE_EVENT, onExternal);
    return () => {
      document.removeEventListener(EXTERNAL_ANALYZE_EVENT, onExternal);
      controllerRef.current?.cancel();
    };
  }, []);

  const analyze = useCallback((): void => {
    setShowDiagnose(false);
    void controllerRef.current?.start();
  }, []);

  const stop = useCallback((): void => {
    controllerRef.current?.cancel();
  }, []);

  const ackConsent = useCallback((): void => {
    setConsentVisible(false);
    void setCache(CONSENT_KEY, true); // SR-18 — ghi nhận đã hiển thị; lỗi storage không chặn luồng
  }, []);

  const busy = state.status === "reading" || state.status === "streaming";
  const email = controllerRef.current?.getEmail() ?? null; // UC-02 — email nguồn cho reply

  return (
    <div className="aimh-panel" role="complementary" aria-label="AIMailHelper">
      <p className="aimh-panel-title">{t("panel.title")}</p>
      <div className="aimh-panel-actions">
        <button type="button" className="aimh-btn aimh-btn-primary" disabled={busy} onClick={analyze}>
          {busy ? t("panel.analyze.running") : t("panel.analyze.button")}
        </button>
        {state.status === "streaming" && (
          <button type="button" className="aimh-btn" onClick={stop}>{t("panel.analyze.stop")}</button>
        )}
        <button type="button" className="aimh-btn" onClick={() => setShowDiagnose((value) => !value)}>
          {t("panel.diagnose.button")}
        </button>
      </div>
      {consentVisible && (
        <div className="aimh-consent" role="note">
          <p className="aimh-note">{t("panel.consent.banner")}</p>
          <button type="button" className="aimh-btn" onClick={ackConsent}>{t("panel.consent.ack")}</button>
        </div>
      )}
      {state.status === "reading" && <p className="aimh-note">{t("panel.analyze.readingEmail")}</p>}
      {state.status === "streaming" && <pre className="aimh-stream">{state.raw}</pre>}
      {state.result !== null && <AnalysisView result={state.result} />}
      {state.error !== null && <ErrorBanner error={state.error} onRetry={analyze} />}
      {state.result !== null && <ReplySection email={email} />}
      {showDiagnose && <DiagnoseView onClose={() => setShowDiagnose(false)} />}
    </div>
  );
}
