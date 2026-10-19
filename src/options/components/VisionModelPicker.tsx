// src/options/components/VisionModelPicker.tsx — Model VL config (Vision-read attachment) giống hệt Provider LLM UI
// GĐ4 UAT 18/10: giao diện Provider/URL/API Key/Model giống Provider Form
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { PROVIDER_IDS } from "../../shared/storage-schema";
import type { ConfigData } from "../useConfigData";
import type { ProviderId } from "../../shared/llm/types";

export function VisionModelPicker(props: {
  draft: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string }; model: string } | null;
  config: ConfigData;
  onDraft: (next: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string }; model: string }) => void;
}): JSX.Element {
  const vision = props.draft?.vision ?? { enabled: false, model: "", provider: "local", url: "", apiKey: "" };
  const [provider, setProvider] = useState<ProviderId>((vision.provider as ProviderId) ?? "local");
  const [model, setModel] = useState<string>(vision.model ?? "");
  const [url, setUrl] = useState<string>(vision.url ?? "");
  const [apiKey, setApiKey] = useState<string>(vision.apiKey ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  useEffect(() => {
    setProvider((vision.provider as ProviderId) ?? "local");
    setModel(vision.model ?? "");
    setUrl(vision.url ?? "");
    setApiKey(vision.apiKey ?? "");
  }, [props.draft?.vision?.model, props.draft?.vision?.provider, props.draft?.vision?.url, props.draft?.vision?.apiKey]);

  const save = async () => {
    setStatus("saving");
    try {
      await props.config.setVision({
        enabled: true,
        model,
        provider,
        url,
        apiKey
      });
      props.onDraft({ vision: { model, provider, url, apiKey }, model: props.draft?.model ?? "" });
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="provider-form">
      <label className="field">
        <span>{t("options.visionModel.provider")}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>
      <p className="note">{t("options.visionModel.providerHint")}</p>

      <label className="field">
        <span>{t("options.visionModel.apiKey")}</span>
        <input
          type="password"
          value={apiKey}
          placeholder=""
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <small className="hint">{t("options.visionModel.apiKeyHint")}</small>

      <label className="field">
        <span>{t("options.visionModel.url")}</span>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <small className="hint">{t("options.visionModel.urlHint")}</small>

      <label className="field">
        <span>{t("options.visionModel.dedicated")}</span>
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
      <small className="hint">{t("options.visionModel.dedicatedHint")}</small>

      <button type="button" disabled={status === "saving"} onClick={save}>
        {status === "saving" ? t("options.provider.saving") : t("options.visionModel.save")}
      </button>
      {status === "saved" && <p className="note ok">{t("options.visionModel.saved")}</p>}
      {status === "failed" && <p className="warning">{t("options.visionModel.saveFailed")}</p>}
    </div>
  );
}
