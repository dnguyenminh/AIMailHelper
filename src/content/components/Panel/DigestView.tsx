// src/content/components/Panel/DigestView.tsx — UC-03/UC-04 UI (FR-GD5-02..05; FSD 3.4 màn 4).
// Tiến độ quét + Digest sort score giảm dần (FR-GD5-04, badge màu theo score — FSD UI spec);
// EF-1 cache trống → hướng dẫn "Chạy Triage inbox trước"; EF-5 overflow → nút "Quét tiếp";
// EF-2/EF-4 đổi folder → ghi chú dừng an toàn; AF-5 scanMore giữ kết quả cũ; AF-2 rescan bỏ cache.
import { t } from "../../../shared/i18n";
import type { TriageUiState } from "../../modules/digest";

const badgeClassOf = (score: number): string =>
  score >= 70 ? "aimh-badge-high" : score >= 40 ? "aimh-badge-medium" : "aimh-badge-low"; // đỏ/cam/xanh

export interface DigestViewProps {
  state: TriageUiState;
  onStart: () => void;
  onScanMore: () => void;
  onRescan: () => void;
  onStop: () => void;
  titleKey?: string;
  onScrollToItem?: (messageId: string) => void; // UAT — cuộn đến mail (không mở, không đổi trạng thái)
  onOpenItem?: (messageId: string) => void; // UAT — mở mail (Outlook đánh dấu đã đọc)
}

export function DigestView({ state, onStart, onScanMore, onRescan, onStop, titleKey, onScrollToItem, onOpenItem }: DigestViewProps) {
  const running = state.status === "running";
  const empty = !running && state.digest.length === 0 && state.progress.total === 0; // EF-1 UC-04
  return (
    <div className="aimh-digest">
      <h4 className="aimh-heading">{t(titleKey ?? "panel.triage.title")}</h4>
      <div className="aimh-row">
        <button type="button" className={"aimh-btn aimh-btn-primary" + (running ? " aimh-btn-loading" : "")} disabled={running} onClick={onStart}>
          {running
            ? t("panel.triage.running", { done: state.progress.done, total: state.progress.total })
            : t("panel.triage.button")}
        </button>
        {running && (
          <button type="button" className="aimh-btn" onClick={onStop}>{t("panel.triage.stop")}</button>
        )}
        {!running && state.digest.length > 0 && (
          <button type="button" className="aimh-btn" onClick={onRescan}>{t("panel.triage.rescan")}</button>
        )}
      </div>
      {empty && (
        <div className="aimh-warning" role="note">
          <p className="aimh-note">{t("panel.triage.empty")}</p>
          <button type="button" className="aimh-btn" onClick={onStart}>{t("panel.triage.emptyAction")}</button>
        </div>
      )}
      {state.cachedSkipped > 0 && (
        <p className="aimh-note">{t("panel.triage.cachedNote", { count: state.cachedSkipped })}</p> // BR-09
      )}
      {state.overflow > 0 && (
        <div className="aimh-warning" role="note">
          <p className="aimh-note">{t("panel.triage.overflow", { count: state.overflow, cap: state.cap })}</p>
          <button type="button" className="aimh-btn" disabled={running} onClick={onScanMore}>
            {t("panel.triage.scanMore")} {/* EF-5 — AF-5 UC-03 */}
          </button>
        </div>
      )}
      {state.folderStopped && <p className="aimh-note">{t("panel.triage.folderStopped")}</p>} {/* EF-2/EF-4 */}
      {/* EF-3 — số item chưa chấm */}
      {state.progress.failed > 0 && (
        <p className="aimh-note">{t("panel.triage.failedNote", { count: state.progress.failed })}</p>
      )}
      {state.error !== null && (
        <p className="aimh-error-msg">{t(state.error.i18nKey, state.error.params)}</p>
      )}
      {state.digest.length > 0 && (
        <ul className="aimh-list aimh-digest-list">
          {state.digest.map((entry) => (
            <li key={entry.messageId}>
              <span className={"aimh-badge " + badgeClassOf(entry.score)}>{entry.score}</span>
              <span className="aimh-text"> {entry.subject}</span>
              <span className="aimh-note"> — {entry.reason}</span> {/* FR-GD5-04 — lý do */}
              {onScrollToItem !== undefined && (
                <button type="button" className="aimh-btn" aria-label={t("panel.digest.scrollTo")} onClick={() => onScrollToItem(entry.messageId)}>👁</button>
              )}
              {onOpenItem !== undefined && (
                <button type="button" className="aimh-btn" aria-label={t("panel.digest.open")} onClick={() => onOpenItem(entry.messageId)}>↗</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
