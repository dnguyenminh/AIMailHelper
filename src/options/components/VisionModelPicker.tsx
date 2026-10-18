// src/options/components/VisionModelPicker.tsx — chọn VL model cho Vision-read (UAT 18/10).
// Tách riêng VL model để rõ ràng: VL model = model vision riêng; trống = dùng model chính (nếu hỗ trợ VL).
import { t } from "../../shared/i18n";
import { isVisionCapableModel } from "../../shared/llm/vision-model";
import type { ConfigData } from "../useConfigData";

export function VisionModelPicker(props: { draft: { vision?: { model?: string }; model: string } | null; config: ConfigData; onDraft: (next: { vision?: { model?: string }; model: string }) => void }): JSX.Element {
  const mainModel = props.draft?.model ?? "";
  const isMainModelVL = mainModel ? isVisionCapableModel(mainModel) : false;

  // Force TypeScript to recognize usage in JSX
  const _isMainModelVL = isMainModelVL;

  return (
    <div className="vision-model-picker">
      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.dedicated")}</span>
          <input
            type="text"
            value={props.draft?.vision?.model ?? ""}
            placeholder={t("options.visionModel.placeholder")}
            onChange={(e) => props.onDraft({ vision: { model: e.target.value }, model: "" })}
          />
        </label>
        <small className="hint">{t("options.visionModel.dedicatedHint")}</small>
      </div>

      <div className="field-group">
        <label className="field row">
          <input
            type="checkbox"
            checked={_isMainModelVL}
            disabled
          />
          <span>{t("options.visionModel.mainModelIsVL", { model: mainModel || "—" })}</span>
        </label>
        {_isMainModelVL && <small className="hint ok">{t("options.visionModel.mainModelVLActive")}</small>}
        {!_isMainModelVL && mainModel && <small className="hint">{t("options.visionModel.mainModelNotVL")}</small>}
      </div>

      <div className="field-group">
        <label className="field row">
          <input
            type="checkbox"
            checked={false} // vision.enabled is handled in VisionSettings
            disabled
          />
          <span>{t("options.vision.enable")}</span>
        </label>
        <small className="hint">{t("options.vision.enableHint")}</small>
      </div>
    </div>
  );
}