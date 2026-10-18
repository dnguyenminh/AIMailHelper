// src/options/components/VisionSettings.tsx — T3 vision toggle (FR-GD4-05; BR-03; EF-3 UC-04).
// Mặc định TẮT (BR-03 — DEFAULT_VISION); bật → cảnh báo privacy (ảnh chụp gửi tới LLM provider).
// UAT 18/10 — Vision-read attachment: ô "Model VL" (rule user: VL riêng → model text nếu hỗ
// trợ VL → bỏ qua). Save qua CONFIG_SET section vision — validate ở SW (BR-15).
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import type { ConfigData } from "../useConfigData";
import type { VisionConfig } from "../../shared/types";

export function VisionSettings(props: { config: ConfigData }): JSX.Element {
  const stored = props.config.data?.vision ?? null;
  const [draft, setDraft] = useState<VisionConfig>({ enabled: false });
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    if (stored) setDraft(stored); // reload sau save → sync lại từ SW
  }, [stored]);

  const save = async (next: VisionConfig): Promise<void> => {
    try {
      await props.config.setVision(next);
      setStatus("saved");
    } catch {
      setStatus("failed"); // giá trị sai bị từ chối BR-15 — không âm thầm sửa
    }
  };

  return (
    <div className="vision-settings">
      <label className="field row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => {
            const next = { enabled: event.target.checked, model: draft.model };
            setDraft(next);
            void save(next);
          }}
        />
        <span>{t("options.vision.toggle")}</span>
      </label>
      <small className="hint">{t("options.vision.warning")}</small>{" "}
      {/* EF-3 — cảnh báo privacy bắt buộc khi toggle */}
      <label className="field">
        <span>{t("options.vision.vlModel")}</span>
        <input
          type="text" value={draft.model ?? ""} placeholder={t("options.vision.vlModelPlaceholder")}
          onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          onBlur={(event) => void save({ ...draft, model: event.target.value })}
        />
        <small className="hint">{t("options.vision.vlModelHint")}</small>
      </label>
      {status === "saved" && <p className="note ok">{t("options.vision.changed")}</p>}
      {status === "failed" && <p className="warning">{t("errors.badRequest")}</p>}
    </div>
  );
}
