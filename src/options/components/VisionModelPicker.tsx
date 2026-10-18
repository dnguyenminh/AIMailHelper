// src/options/components/VisionModelPicker.tsx — chọn VL model cho Vision-read (UAT 18/10).
// Giao diện cực kỳ đơn giản: 1 ô input + nút lưu + trạng thái model chính.
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { isVisionCapableModel } from "../../shared/llm/vision-model";
import type { ConfigData } from "../useConfigData";

export function VisionModelPicker(props: { draft: { vision?: { model?: string }; model: string } | null; config: ConfigData; onDraft: (next: { vision?: { model?: string }; model: string }) => void }): JSX.Element {
  const mainModel = props.draft?.model ?? "";
  const [draftVlModel, setDraftVlModel] = useState<string>(props.draft?.vision?.model ?? "");
  const isMainModelVL = mainModel ? isVisionCapableModel(mainModel) : false;

  const handleSave = async () => {
    props.onDraft({ vision: { model: draftVlModel }, model: "" });
    await props.config.setVision({ enabled: true, model: draftVlModel });
  };

  useEffect(() => {
    setDraftVlModel(props.draft?.vision?.model ?? "");
  }, [props.draft?.vision?.model]);

  return (
    <div className="vision-model-picker">
      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.dedicated")}</span>
          <input
            type="text"
            value={draftVlModel}
            placeholder={t("options.visionModel.placeholder")}
            onChange={(e) => setDraftVlModel(e.target.value)}
          />
        </label>
        <small className="hint">{t("options.visionModel.dedicatedHint")}</small>
      </div>

      <div className="field-group">
        <span className={isMainModelVL ? "hint ok" : "hint"}>
          {isMainModelVL
            ? t("options.visionModel.mainModelVLActive", { model: mainModel })
            : t("options.visionModel.mainModelNotVL", { model: mainModel || "—" })}
        </span>
      </div>

      <button type="button" onClick={handleSave}>
        {t("options.visionModel.save")}
      </button>
    </div>
  );
}