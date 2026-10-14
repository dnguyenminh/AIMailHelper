// src/options/components/AutomationSettings.tsx — auto-mode toggle + confirm + batchSize/throttle (GĐ2).
// BR-02: bật CẦN confirm dialog; hủy → không đổi (EF-3). SR-11: warning nêu rõ EMAIL MỚI TỰ ĐỘNG
// gửi tới LLM provider (disclosure end-to-end) + KHÔNG BAO GIỜ tự gửi. Rules editor ở GĐ6.
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import type { ConfigData } from "../useConfigData";
import type { AutomationConfig } from "../../shared/types";

export function AutomationSettings(props: { config: ConfigData }): JSX.Element {
  const stored = props.config.data?.automation ?? null;
  const [draft, setDraft] = useState<AutomationConfig>({ enabled: false, rules: [], batchSize: 5, throttleMs: 1000, triageCap: 50 });
  const [confirming, setConfirming] = useState(false); // EF-3 — dialog bật auto-mode
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    if (stored) setDraft(stored);
  }, [stored]);

  // Toggle ON → mở confirm (không ghi ngay); OFF → ghi ngay (turn-off an toàn luôn được phép).
  const toggle = (next: boolean): void => {
    if (next) setConfirming(true);
    else void apply({ ...draft, enabled: false });
  };

  const apply = async (value: AutomationConfig): Promise<void> => {
    setConfirming(false);
    try {
      await props.config.setAutomation(value);
      setDraft(value);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="automation-settings">
      <label className="field row">
        <input type="checkbox" checked={draft.enabled} onChange={(event) => toggle(event.target.checked)} />
        <span>{t("options.automation.autoMode")}</span>
      </label>
      <p className="warning">{t("options.automation.enableWarning")}</p>
      {confirming && (
        <div className="confirm-box" role="dialog" aria-label={t("options.automation.enableConfirmTitle")}>
          <p className="confirm-title">{t("options.automation.enableConfirmTitle")}</p>
          <p className="warning">{t("options.automation.enableWarning")}</p>
          <button type="button" onClick={() => void apply({ ...draft, enabled: true })}>{t("options.automation.confirmYes")}</button>
          <button type="button" onClick={() => setConfirming(false)}>{t("options.automation.confirmNo")}</button>
        </div>
      )}
      <label className="field">
        <span>{t("options.automation.batchSize")}</span>
        <input
          type="number" min={1} max={50} value={draft.batchSize}
          onChange={(event) => setDraft({ ...draft, batchSize: clampInt(event.target.value, 1, 50, draft.batchSize) })}
        />
      </label>
      <label className="field">
        <span>{t("options.automation.throttle")}</span>
        <input
          type="number" min={0} max={60000} step={100} value={draft.throttleMs}
          onChange={(event) => setDraft({ ...draft, throttleMs: clampInt(event.target.value, 0, 60000, draft.throttleMs) })}
        />
      </label>
      <button type="button" onClick={() => void apply(draft)}>{t("options.automation.save")}</button>
      {status === "saved" && <p className="note ok">{t("options.automation.saved")}</p>}
      {status === "failed" && <p className="warning">{t("options.automation.changeFailed")}</p>}
    </div>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
