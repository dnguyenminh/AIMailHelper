// src/options/components/VisionModelPicker.tsx — Model VL config giống Provider Form, model combobox với fetch real models
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import { PROVIDER_IDS } from "../../shared/storage-schema";
import type { ConfigData } from "../useConfigData";
import type { ProviderId } from "../../shared/llm/types";
import { sendMessage } from "../../shared/messaging";

const VL_MODEL_PRESETS: Record<ProviderId, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"],
  azure: [""],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  "openai-compatible": ["gpt-4o", "gpt-4o-mini", "qwen-vl", "llama-3.2-90b-vision"],
  local: ["llava", "moondream2", "qwen-vl", "llama-3.2-90b-vision"]
};

// preset không lưu storage — đoán từ URL đã lưu để select hiển thị đúng (LM Studio vs Ollama).
function guessPreset(url: string | undefined): "ollama" | "lmstudio" {
  return url && url.includes(":1234") ? "lmstudio" : "ollama";
}

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

  useEffect(() => {
    setProvider((vision.provider as ProviderId) ?? "local");
    setModel(vision.model ?? "");
    setUrl(vision.url ?? "");
    setApiKey(vision.apiKey ?? "");
    setPreset((vision.preset as "ollama" | "lmstudio") ?? guessPreset(vision.url));
  }, [props.draft?.vision?.model, props.draft?.vision?.provider, props.draft?.vision?.url, props.draft?.vision?.apiKey, props.draft?.vision?.preset]);

  // KHÔNG ép url theo preset lúc mount (bug cũ: đè URL LM Studio đã lưu) — chỉ đổi url khi user chủ động đổi preset.
  const changePreset = (next: "ollama" | "lmstudio"): void => {
    setPreset(next);
    setUrl(next === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1");
  };

  useEffect(() => {
    const fetchModels = async () => {
      if (!provider || provider === "azure" || !apiKey) {
        setModelList(VL_MODEL_PRESETS[provider] ?? []);
        return;
      }
      try {
        const config = { provider, model: "", apiKey: apiKey || undefined, baseUrl: url || undefined };
        const response = await sendMessage<{ models: string[] }>("LIST_MODELS", { config });
        if (response.models && response.models.length > 0) {
          setModelList(response.models);
        } else {
          setModelList(VL_MODEL_PRESETS[provider] ?? []);
        }
      } catch {
        setModelList(VL_MODEL_PRESETS[provider] ?? []);
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
            <select value={preset} onChange={(e) => changePreset(e.target.value as "ollama" | "lmstudio")}>
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
