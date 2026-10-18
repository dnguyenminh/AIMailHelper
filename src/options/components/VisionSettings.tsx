// src/options/components/VisionSettings.tsx — T3 vision toggle (FR-GD4-05; BR-03; EF-3 UC-04).
// Mặc định TẮT (BR-03 — DEFAULT_VISION); bật → cảnh báo privacy (ảnh chụp gửi tới LLM provider).
// VL model được cấu hình trong VisionModelPicker (section riêng).
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
            const next = { enabled: event.target.checked };
            setDraft(next);
            void save(next);
          }}
        />
        <span>{t("options.vision.toggle")}</span>
      </label>
      <small className="hint">{t("options.vision.warning")}</small>{" "}
      {/* EF-3 — cảnh báo privacy bắt buộc khi toggle */}
      {status === "saved" && <p className="note ok">{t("options.vision.changed")}</p>}
      {status === "failed" && <p className="warning">{t("errors.badRequest")}</p>}
      <p className="note">{t("options.vision.modelNote")}</p>
    </div>
  );
}
