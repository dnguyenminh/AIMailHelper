// src/options/components/VisionModelPicker.tsx — chọn VL model cho Vision-read (UAT 18/10).
// Giao diện đầy đủ như section Provider LLM: Provider, Preset, URL, Model, API key.
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { isVisionCapableModel } from "../../shared/llm/vision-model";
import type { ConfigData } from "../useConfigData";
import type { VisionConfig } from "../../shared/types";

export function VisionModelPicker(props: { draft: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string }; model: string } | null; config: ConfigData; onDraft: (next: { vision?: { model?: string }; model: string }) => void }): JSX.Element {
  const mainModel = props.draft?.model ?? "";
  const isMainModelVL = mainModel ? isVisionCapableModel(mainModel) : false;
  const [draftVlModel, setDraftVlModel] = useState<string>(props.draft?.vision?.model ?? "");
  const [draftVlProvider, setDraftVlProvider] = useState<string>(props.draft?.vision?.provider ?? "local");
  const [draftVlUrl, setDraftVlUrl] = useState<string>(props.draft?.vision?.url ?? "");
  const [draftVlApiKey, setDraftVlApiKey] = useState<string>(props.draft?.vision?.apiKey ?? "");

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

  const isVLModelLocal = draftVlProvider === "local";

  return (
    <div className="vision-model-picker">
      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.provider")}</span>
          <select value={draftVlProvider} onChange={(e) => setDraftVlProvider(e.target.value)}>
            <option value="local">local</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </label>
        <small className="hint">{t("options.visionModel.providerHint")}</small>
      </div>

      <div className="field-group">
        <label className="field">
          <span>{t("options.visionModel.apiKey")}</span>
          <input
            type="password"
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
        {!isMainModelVL && mainModel && <small className="hint">{t("options.visionModel.mainModelNotVL")}</small>}
      </div>

      <button type="button" onClick={handleSave}>
        {t("options.visionModel.save")}
      </button>
    </div>
  );
}