// src/content/components/Panel/Panel.tsx — Panel AI GĐ3 (TDD §3.6; FR-GD3-05/06).
// Shadow DOM (đã mount bởi index.tsx): nút "AI phân tích" + "Dừng" + Soạn trả lời (disabled — GĐ4),
// consent banner lần đầu analyze (SR-18 — đóng không chặn luồng), streaming raw, AnalysisView
// structured + badge màu, ErrorBanner (ERR + Thử lại + EF-6 raw).
import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, setCache } from "../../../shared/cache-store";
import { t } from "../../../shared/i18n";
import { createAnalyzeController } from "../../modules/analyze";
import type { AnalysisUiState } from "../../modules/analyze";
import { AnalysisView } from "./AnalysisView";
import { ErrorBanner } from "./ErrorBanner";

const CONSENT_KEY = "panel.consentShown"; // SR-18 — ghi nhận đã hiển thị
const EXTERNAL_ANALYZE_EVENT = "aimh:analyze"; // nút toolbar inject (owa-adapter) bắn event này

const isTrue = (value: unknown): true | null => (value === true ? true : null);

export function Panel() {
  const [state, setState] = useState<AnalysisUiState>({ status: "idle", raw: "", result: null, error: null });
  const [consentVisible, setConsentVisible] = useState(false);
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
        <button type="button" className="aimh-btn" disabled title={t("panel.analyze.replySoon")}>
          {t("panel.analyze.replyButton")}
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
    </div>
  );
}
