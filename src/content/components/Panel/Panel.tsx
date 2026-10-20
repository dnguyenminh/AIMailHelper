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
import { owaAdapter } from "../../owa-adapter/owa-adapter";
import { createTriageController, createUnreadTriageController } from "../../modules/digest";
import type { TriageUiState } from "../../modules/digest";
const IDLE_SCAN: TriageUiState = { status: "running", progress: { done: 0, total: 0, failed: 0 }, cachedSkipped: 0, cap: 0, overflow: 0, folderStopped: false, userStopped: false, error: null, digest: [] };
import { AnalysisView } from "./AnalysisView";
import { CopilotResult } from "./CopilotResult"; // GĐ-B — Copilot verbatim (result=null)
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
  const [unread, setUnread] = useState<TriageUiState | null>(null);
  const [showUnread, setShowUnread] = useState(false);
  const [showTriage, setShowTriage] = useState(false);
  const [auto, setAuto] = useState<AutoModeState>(IDLE_AUTO); // GĐ6 — BR-02 false mặc định
  const [showQueue, setShowQueue] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [showDiagnose, setShowDiagnose] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createAnalyzeController> | null>(null);
  const triageRef = useRef<ReturnType<typeof createTriageController> | null>(null);
  const unreadRef = useRef<ReturnType<typeof createUnreadTriageController> | null>(null);
  const autoRef = useRef<ReturnType<typeof createAutoModeController> | null>(null);

  useEffect(() => {
    controllerRef.current = createAnalyzeController(setState);
    triageRef.current = createTriageController(setTriage); // GĐ5 — UC-03/UC-04
    unreadRef.current = createUnreadTriageController(setUnread); // UAT — list mail chưa đọc (chỉ-đọc DOM)
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
      unreadRef.current?.cancel();
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

  // UAT (mail chưa đọc + sàng lọc) — callbacks gọn; set state NGAY để spinner hiện.
  const unreadStart = useCallback((): void => {
    setShowDiagnose(false); setShowUnread(true); setShowTriage(false);
    if (unread?.status !== "running") setUnread(IDLE_SCAN);
    void unreadRef.current?.start();
  }, [unread]);
  const unreadScanMore = useCallback((): void => { void unreadRef.current?.scanMore(); }, []);
  const unreadRescan = useCallback((): void => { void unreadRef.current?.rescan(); }, []);
  const unreadStop = useCallback((): void => { unreadRef.current?.cancel(); }, []);
  const triageStartFromPanel = useCallback((): void => {
    setShowDiagnose(false); setShowUnread(false); setShowTriage(true);
    if (triage?.status !== "running") setTriage(IDLE_SCAN);
    void triageRef.current?.start();
  }, [triage]);
  const scrollToUnread = useCallback(async (id: string): Promise<void> => { void owaAdapter.scrollToItem(id); }, []);
  const openUnread = useCallback(async (id: string): Promise<void> => { void owaAdapter.openItem(id); }, []);

  const ackConsent = useCallback((): void => {
    setConsentVisible(false);
    void setCache(CONSENT_KEY, true); // SR-18 — ghi nhận đã hiển thị; lỗi storage không chặn luồng
  }, []);

  const busy = state.status === "reading" || state.status === "streaming";
  const unreadRunning = unread?.status === "running";
  const triageRunning = triage?.status === "running";
  const email = controllerRef.current?.getEmail() ?? null; // UC-02 — email nguồn cho reply

  return (
    <PanelWindow host={host}>
      <div className="aimh-panel" role="complementary" aria-label="AIMailHelper">
      <div className="aimh-panel-actions">
        <button type="button" className={"aimh-btn aimh-btn-primary" + (busy ? " aimh-btn-loading" : "")} disabled={busy} onClick={analyze}>
          {busy ? t("panel.analyze.running") : t("panel.analyze.button")}
        </button>
        {state.status === "streaming" && (
          <button type="button" className="aimh-btn" onClick={stop}>{t("panel.analyze.stop")}</button>
        )}
        <button type="button" className="aimh-btn" onClick={() => setShowDiagnose((value) => !value)}>
          {t("panel.diagnose.button")}
        </button>
        <button type="button" className={"aimh-btn" + (unreadRunning ? " aimh-btn-loading" : "")} disabled={busy || unreadRunning || triageRunning} onClick={unreadStart}>
          {t("panel.unread.scan")}
        </button>
        <button type="button" className={"aimh-btn" + (triageRunning ? " aimh-btn-loading" : "")} disabled={busy || unreadRunning || triageRunning} onClick={triageStartFromPanel}>
          {t("panel.triage.button")}
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
      {state.copilot === true && state.status === "done" && <CopilotResult raw={state.raw} />}
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
      {showUnread && unread !== null && (
        <>
          <p className="aimh-note">{t("panel.unread.readonly")}</p>
          <DigestView
            state={unread}
            onStart={unreadStart}
            onScanMore={unreadScanMore}
            onRescan={unreadRescan}
            onStop={unreadStop}
            titleKey="panel.unread.title"
            onScrollToItem={(id) => void scrollToUnread(id)}
            onOpenItem={(id) => void openUnread(id)}
          />
        </>
      )}
      {showTriage && triage !== null && (
        <DigestView
          state={triage}
          onStart={triageStartFromPanel}
          onScanMore={triageScanMore}
          onRescan={triageRescan}
          onStop={triageStop}
          titleKey="panel.triage.title"
          onScrollToItem={(id) => void scrollToUnread(id)}
          onOpenItem={(id) => void openUnread(id)}
        />
      )}
      {showQueue && <QueueView state={auto} controller={autoRef.current} />} {/* GĐ6 — UC-07 */}
      {showDiagnose && <DiagnoseView onClose={() => setShowDiagnose(false)} />}
      </div>
    </PanelWindow>
  );
}
