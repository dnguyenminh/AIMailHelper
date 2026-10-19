// src/options/components/VisionModelPicker.tsx — Model VL config giống Provider Form, model combobox với fetch real models
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { PROVIDER_IDS } from "../../shared/storage-schema";
import type { ConfigData } from "../useConfigData";
import type { ProviderId } from "../../shared/llm/types";
import { sendMessage } from "../../shared/messaging";

export function VisionModelPicker(props: {
  draft: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string; preset?: string }; model: string } | null;
  config: ConfigData;
  onDraft: (next: { vision?: { model?: string; provider?: string; url?: string; apiKey?: string; preset?: string }; model: string }) => void;
}): JSX.Element {
  const vision = props.draft?.vision ?? { enabled: false, model: "", provider: "local", url: "", apiKey: "", preset: "ollama" };
  const [provider, setProvider] = useState<ProviderId>((vision.provider as ProviderId) ?? "local");
  const [model, setModel] = useState<string>(vision.model ?? "");
  const [url, setUrl] = useState<string>(vision.url ?? "");
  const [apiKey, setApiKey] = useState<string>(vision.apiKey ?? "");
  const [preset, setPreset] = useState<"ollama" | "lmstudio">(vision.preset as "ollama" | "lmstudio" ?? "ollama");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [modelList, setModelList] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    setProvider((vision.provider as ProviderId) ?? "local");
    setModel(vision.model ?? "");
    setUrl(vision.url ?? "");
    setApiKey(vision.apiKey ?? "");
    setPreset((vision.preset as "ollama" | "lmstudio") ?? "ollama");
  }, [props.draft?.vision?.model, props.draft?.vision?.provider, props.draft?.vision?.url, props.draft?.vision?.apiKey, props.draft?.vision?.preset]);

  useEffect(() => {
    if (preset === "ollama") setUrl("http://localhost:11434");
    else setUrl("http://localhost:1234/v1");
  }, [preset]);

  useEffect(() => {
    const fetchModels = async () => {
      if (!provider || provider === "azure") return;
      setFetching(true);
      try {
        const config = { provider, model: "", apiKey: apiKey || undefined, baseUrl: url || undefined };
        const response = await sendMessage<{ models: string[] }>("LIST_MODELS", { config });
        setModelList(response.models || []);
      } catch {
        setModelList([]);
      } finally {
        setFetching(false);
      }
    };
    fetchModels();
  }, [provider, apiKey, url]);

  const save = async () => {
    setStatus("saving");
    try {
      await props.config.setVision({ enabled: true, model, provider, url, apiKey });
      props.onDraft({ vision: { model, provider, url, apiKey, preset }, model: props.draft?.model ?? "" });
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  };

  const isLocal = provider === "local";
  const isCloud = provider === "openai" || provider === "anthropic" || provider === "gemini";
  const isOpenAICompat = provider === "openai-compatible";
  const isAzure = provider === "azure";

  const getOrigin = () => {
    try {
      return url ? new URL(url).origin : "";
    } catch {
      return "";
    }
  };

  const modelListId = `vl-model-list-${provider}`;

  return (
    <div className="provider-form">
      <label className="field">
        <span>{t("options.provider.provider")}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>
      <p className="note">{t("options.visionModel.providerHint")}</p>

      {isLocal && (
        <>
          <label className="field">
            <span>{t("options.provider.preset")}</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as "ollama" | "lmstudio")}>
              <option value="ollama">{t("options.provider.preset.ollama")}</option>
              <option value="lmstudio">{t("options.provider.preset.lmstudio")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("options.provider.localUrl")}</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          {url && <small className="hint">{t("options.provider.permissionWarning", { origin: getOrigin() })}</small>}
        </>
      )}

      {isCloud && (
        <>
          <label className="field">
            <span>{t("options.provider.apiKey")}</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
        </>
      )}

      {isOpenAICompat && (
        <>
          <label className="field">
            <span>{t("options.provider.apiKey")}</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("options.provider.baseUrl")}</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          {url && <small className="hint">{t("options.provider.permissionWarning", { origin: getOrigin() })}</small>}
        </>
      )}

      {!isAzure && (
        <label className="field">
          <span>{t("options.provider.model")}</span>
          <input
            list={modelListId}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t("options.visionModel.placeholder")}
          />
          <datalist id={modelListId}>
            {modelList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </datalist>
          {fetching && <small className="hint">{t("options.model.fetching")}</small>}
        </label>
      )}

      <button type="button" disabled={status === "saving"} onClick={save}>
        {status === "saving" ? t("options.provider.saving") : t("options.visionModel.save")}
      </button>
      {status === "saved" && <p className="note ok">{t("options.visionModel.saved")}</p>}
      {status === "failed" && <p className="warning">{t("options.visionModel.saveFailed")}</p>}
    </div>
  );
}
