// src/options/components/VisionModelPicker.tsx — chọn VL model cho Vision-read (UAT 18/10).
// Giao diện giống hệt Option LLM: Provider, API Key, URL, Model, nút Lưu.
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { isVisionCapableModel } from "../../shared/llm/vision-model";
import type { ConfigData } from "../useConfigData";

export function VisionModelPicker(props: { draft: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string }; model: string } | null; config: ConfigData; onDraft: (next: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string }; model: string }) => void }): JSX.Element {
  const mainModel = props.draft?.model ?? "";
  const [draftVlModel, setDraftVlModel] = useState<string>(props.draft?.vision?.model ?? "");
  const [draftVlProvider, setDraftVlProvider] = useState<string>(props.draft?.vision?.provider ?? "local");
  const [draftVlUrl, setDraftVlUrl] = useState<string>(props.draft?.vision?.url ?? "");
  const [draftVlApiKey, setDraftVlApiKey] = useState<string>(props.draft?.vision?.apiKey ?? "");
  const isMainModelVL = mainModel ? isVisionCapableModel(mainModel) : false;

  const handleSave = async () => {
    props.onDraft({ vision: { model: draftVlModel, provider: draftVlProvider, url: draftVlUrl, apiKey: draftVlApiKey }, model: "" });
    await props.config.setVision({ enabled: true, model: draftVlModel, provider: draftVlProvider, url: draftVlUrl, apiKey: draftVlApiKey });
  };

  useEffect(() => {
    setDraftVlModel(props.draft?.vision?.model ?? "");
    setDraftVlProvider(props.draft?.vision?.provider ?? "local");
    setDraftVlUrl(props.draft?.vision?.url ?? "");
    setDraftVlApiKey(props.draft?.vision?.apiKey ?? "");
  }, [props.draft?.vision?.model, props.draft?.vision?.provider, props.draft?.vision?.url, props.draft?.vision?.apiKey]);

  return (
    <div className="vision-model-picker">
      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.provider")}</span>
          <select value={draftVlProvider} onChange={(e) => setDraftVlProvider(e.target.value)}>
            <option value="local">local</option>
            <option value="openai">openai</option>
            <option value="azure">azure</option>
            <option value="anthropic">anthropic</option>
            <option value="gemini">gemini</option>
            <option value="openai-compatible">openai-compatible</option>
          </select>
        </label>
        <small className="hint">{t("options.visionModel.providerHint")}</small>
      </div>

      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.apiKey")}</span>
          <input
            type="text"
            value={draftVlApiKey}
            placeholder={t("options.visionModel.apiKeyPlaceholder")}
            onChange={(e) => setDraftVlApiKey(e.target.value)}
          />
        </label>
        <small className="hint">{t("options.visionModel.apiKeyHint")}</small>
      </div>

      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.url")}</span>
          <input
            type="text"
            value={draftVlUrl}
            placeholder={t("options.visionModel.urlPlaceholder")}
            onChange={(e) => setDraftVlUrl(e.target.value)}
          />
        </label>
        <small className="hint">{t("options.visionModel.urlHint")}</small>
      </div>

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
        <label className="field row">
          <input
            type="checkbox"
            checked={isMainModelVL}
            disabled
          />
          <span>{t("options.visionModel.mainModelIsVL", { model: mainModel || "—" })}</span>
        </label>
        {isMainModelVL && <small className="hint ok">{t("options.visionModel.mainModelVLActive")}</small>}
        {!isVisionCapableModel(mainModel) && mainModel && <small className="hint">{t("options.visionModel.mainModelNotVL")}</small>}
      </div>

      <button type="button" onClick={handleSave}>
        {t("options.visionModel.save")}
      </button>
    </div>
  );
}