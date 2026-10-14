// src/content/components/Panel/QueueView.tsx — UC-07 UI (FR-GD6-04/05; FSD 3.4 màn 5; GĐ6).
// Hàng chờ duyệt auto-mode: list pending (subject + preview draft), Approve/Reject từng item,
// Approve all tuần tự (AF-5 — tổng kết N/M), badge "N chờ duyệt"; EF-5 mismatch → cảnh báo +
// giữ pending; EF-2 chèn thất bại → ERR-09 banner + item về pending; QUEUE_MAX → cảnh báo full.
// Cảnh báo no-Send luôn hiển thị: extension KHÔNG tự gửi — người dùng TỰ bấm Send trong OWA
// (BR-01). KHÔNG có nút Send nào ở đây (TC-121 audit).
import { useEffect, useState } from "react";
import { t } from "../../../shared/i18n";
import type { QueueItem } from "../../../shared/types";
import type { AutoModeController } from "../../modules/automode";
import type { AutoModeState } from "../../modules/automode-types";
import type { InsertDecision } from "../../owa-adapter/actions";

const PREVIEW_CHARS = 160;

interface ConfirmBox {
  all: boolean;
  id: string | null; // null khi needs-confirm xảy ra giữa Approve all
  existing: string;
}

export function QueueView(props: { state: AutoModeState; controller: AutoModeController | null }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void props.controller
      ?.listPending()
      .then((items) => setItems(items))
      .catch(() => setItems([])); // ERR-08 — banner state.lastError hiển thị qua controller
  }, [props.controller, props.state.pendingCount]);

  const refresh = async (): Promise<void> => {
    try {
      setItems((await props.controller?.listPending()) ?? []);
    } catch {
      setItems([]); // storage fail — banner lỗi đã do controller phát
    }
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const approveOne = (id: string, decision?: InsertDecision): Promise<void> =>
    run(async () => {
      const outcome = await props.controller?.approve(id, decision);
      setConfirmBox(outcome?.kind === "needs-confirm" ? { all: false, id: id, existing: outcome.existing } : null);
      await refresh();
    });

  const approveEverything = (decision?: InsertDecision): Promise<void> =>
    run(async () => {
      const result = await props.controller?.approveAll(decision);
      setConfirmBox(result?.kind === "needs-confirm" ? { all: true, id: null, existing: result.existing } : null);
      await refresh();
    });

  const rejectOne = (id: string): Promise<void> =>
    run(async () => {
      await props.controller?.reject(id);
      await refresh();
    });

  const state = props.state;
  const processing = state.enabled && state.processing;
  return (
    <div className="aimh-queue">
      <h4 className="aimh-heading">{t("panel.queue.title")}</h4>
      <div className="aimh-row">
        <button type="button" className="aimh-btn aimh-btn-primary" disabled={busy || items.length === 0} onClick={() => void approveEverything()}>
          {t("panel.queue.approveAll")}
        </button>
        <span className="aimh-note">{t("panel.queue.badge", { count: state.pendingCount })}</span>
      </div>
      {state.lastError !== null && <p className="aimh-error-msg">{t(state.lastError.i18nKey, state.lastError.params)}</p>}
      {state.queueFull && (
        <div className="aimh-warning" role="note">
          <p className="aimh-note">{t("panel.queue.full")}</p> {/* QUEUE_MAX 200 — §7.4 */}
        </div>
      )}
      {state.mismatchId !== null && (
        <div className="aimh-warning" role="note">
          <p className="aimh-note">{t("panel.queue.mismatch")}</p> {/* EF-5 — giữ pending */}
        </div>
      )}
      {state.summary !== null && state.summary.approved + state.summary.failed > 0 && (
        <p className="aimh-note">{t("panel.queue.summary", { approved: state.summary.approved, failed: state.summary.failed })}</p> // AF-5
      )}
      {processing && <p className="aimh-note">{t("panel.queue.processing")}</p>}
      {items.length === 0 ? (
        <p className="aimh-note">{t("panel.queue.empty")}</p>
      ) : (
        <ul className="aimh-list aimh-queue-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="aimh-text">{item.messageId}</span>
              <pre className="aimh-stream">{item.draft.slice(0, PREVIEW_CHARS)}</pre> {/* preview draft */}
              <span className="aimh-row">
                <button type="button" className="aimh-btn aimh-btn-primary" disabled={busy} onClick={() => void approveOne(item.id)}>
                  {t("panel.queue.approve")}
                </button>
                <button type="button" className="aimh-btn" disabled={busy} onClick={() => void rejectOne(item.id)}>
                  {t("panel.queue.reject")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmBox !== null && (
        <div className="confirm-box" role="dialog" aria-label={t("panel.reply.needsConfirm")}>
          <p className="aimh-note">{t("panel.reply.needsConfirm")}</p> {/* AF-5 actions — compose có nội dung */}
          <button type="button" className="aimh-btn" disabled={busy} onClick={() => void (confirmBox.all ? approveEverything("append") : approveOne(confirmBox.id as string, "append"))}>
            {t("panel.reply.append")}
          </button>
          <button type="button" className="aimh-btn" disabled={busy} onClick={() => void (confirmBox.all ? approveEverything("replace") : approveOne(confirmBox.id as string, "replace"))}>
            {t("panel.reply.replace")}
          </button>
          <button type="button" className="aimh-btn" onClick={() => setConfirmBox(null)}>{t("panel.reply.cancel")}</button>
        </div>
      )}
      <p className="aimh-note">{t("panel.queue.noSend")}</p> {/* BR-01 — luôn hiển thị */}
    </div>
  );
}
