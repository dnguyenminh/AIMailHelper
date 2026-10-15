// src/content/components/Panel/Panel.tsx — Panel AI GĐ3+GĐ4 (TDD §3.6; FR-GD3-05/06, FR-GD4-01..06).
// Shadow DOM (đã mount bởi index.tsx): nút "AI phân tích" + "Dừng", consent banner lần đầu
// analyze (SR-18), streaming raw, AnalysisView structured + badge, ErrorBanner (ERR + Thử lại),
// ReplySection UC-02 (soạn trả lời — khi analyze done) + DiagnoseView UC-09.
import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, setCache } from "../../../shared/cache-store";
import { t } from "../../../shared/i18n";
import { createAutoModeController } from "../../modules/automode-deps";
import type { AutoModeState } from "../../modules/automode-types";
import { IDLE_AUTO } from "../../modules/automode-types";
import { createAnalyzeController } from "../../modules/analyze";
import type { AnalysisUiState } from "../../modules/analyze";
import { createTriageController } from "../../modules/digest";
import type { TriageUiState } from "../../modules/digest";
import { AnalysisView } from "./AnalysisView";
import { DiagnoseView } from "./DiagnoseView";
import { DigestView } from "./DigestView";
import { ErrorBanner } from "./ErrorBanner";
import { PanelWindow } from "./PanelWindow";
import { QueueView } from "./QueueView";
import { ReplySection } from "./ReplySection";

const CONSENT_KEY = "panel.consentShown"; // SR-18 — ghi nhận đã hiển thị
const EXTERNAL_ANALYZE_EVENT = "aimh:analyze"; // nút toolbar inject (owa-adapter) bắn event này

const isTrue = (value: unknown): true | null => (value === true ? true : null);

export function Panel({ host }: { host: HTMLDivElement | null }) {
  const [state, setState] = useState<AnalysisUiState>({ status: "idle", raw: "", result: null, error: null });
  const [triage, setTriage] = useState<TriageUiState | null>(null);
  const [auto, setAuto] = useState<AutoModeState>(IDLE_AUTO); // GĐ6 — BR-02 false mặc định
  const [showQueue, setShowQueue] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createAnalyzeController> | null>(null);
  const triageRef = useRef<ReturnType<typeof createTriageController> | null>(null);
  const autoRef = useRef<ReturnType<typeof createAutoModeController> | null>(null);

  useEffect(() => {
    controllerRef.current = createAnalyzeController(setState);
    triageRef.current = createTriageController(setTriage); // GĐ5 — UC-03/UC-04
    autoRef.current = createAutoModeController(setAuto); // GĐ6 — observer CHỈ khi enabled (BR-02)
    void autoRef.current.sync();
    void getCache(CONSENT_KEY, isTrue).then((shown) => setConsentVisible(shown !== true));
    const onExternal = (): void => {
      void controllerRef.current?.start();
    };
    document.addEventListener(EXTERNAL_ANALYZE_EVENT, onExternal);
    return () => {
      document.removeEventListener(EXTERNAL_ANALYZE_EVENT, onExternal);
      controllerRef.current?.cancel();
      triageRef.current?.cancel();
      autoRef.current?.stop(); // tắt observer + hủy stream — hàng chờ GIỮ NGUYÊN (FR-GD6-06)
    };
  }, []);

  const analyze = useCallback((): void => {
    setShowDiagnose(false);
    void controllerRef.current?.start();
  }, []);

  const stop = useCallback((): void => {
    controllerRef.current?.cancel();
  }, []);

  // GĐ5 — UC-03/UC-04: Triage inbox + Quét tiếp (AF-5) + Quét lại (AF-2) + Dừng (EF-3).
  const triageStart = useCallback((): void => {
    setShowDiagnose(false);
    void triageRef.current?.start();
  }, []);
  const triageScanMore = useCallback((): void => {
    void triageRef.current?.scanMore();
  }, []);
  const triageRescan = useCallback((): void => {
    void triageRef.current?.rescan();
  }, []);
  const triageStop = useCallback((): void => {
    triageRef.current?.cancel();
  }, []);

  const ackConsent = useCallback((): void => {
    setConsentVisible(false);
    void setCache(CONSENT_KEY, true); // SR-18 — ghi nhận đã hiển thị; lỗi storage không chặn luồng
  }, []);

  const busy = state.status === "reading" || state.status === "streaming";
  const email = controllerRef.current?.getEmail() ?? null; // UC-02 — email nguồn cho reply

  return (
    <PanelWindow host={host}>
      <div className="aimh-panel" role="complementary" aria-label="AIMailHelper">
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
        {/* GĐ6 — hàng chờ duyệt + badge "N chờ duyệt" (UC-07; chỉ hiện khi auto-mode bật hoặc còn pending) */}
        {(auto.enabled || auto.pendingCount > 0) && (
          <button type="button" className="aimh-btn" onClick={() => setShowQueue((value) => !value)}>
            {t("panel.queue.button")}
            {auto.pendingCount > 0 && (
              <span className="aimh-badge aimh-badge-high" role="status">{t("panel.queue.badge", { count: auto.pendingCount })}</span>
            )}
          </button>
        )}
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
      {triage !== null && (
        <DigestView
          state={triage}
          onStart={triageStart}
          onScanMore={triageScanMore}
          onRescan={triageRescan}
          onStop={triageStop}
        />
      )}
      {showQueue && <QueueView state={auto} controller={autoRef.current} />} {/* GĐ6 — UC-07 */}
      {showDiagnose && <DiagnoseView onClose={() => setShowDiagnose(false)} />}
      </div>
    </PanelWindow>
  );
}
