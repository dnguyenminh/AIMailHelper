// src/options/components/VisionSettings.tsx — T3 vision toggle (FR-GD4-05; BR-03; EF-3 UC-04).
// Mặc định TẮT (BR-03 — DEFAULT_VISION); bật → cảnh báo privacy (ảnh chụp gửi tới LLM provider).
// Save qua CONFIG_SET section vision — validate ở SW (BR-15).
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

  const save = async (next: boolean): Promise<void> => {
    try {
      await props.config.setVision({ enabled: next });
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
            setDraft({ enabled: event.target.checked });
            void save(event.target.checked);
          }}
        />
        <span>{t("options.vision.toggle")}</span>
      </label>
      <small className="hint">{t("options.vision.warning")}</small>{" "}
      {/* EF-3 — cảnh báo privacy bắt buộc khi toggle */}
      {status === "saved" && <p className="note ok">{t("options.vision.changed")}</p>}
      {status === "failed" && <p className="warning">{t("errors.badRequest")}</p>}
    </div>
  );
}
