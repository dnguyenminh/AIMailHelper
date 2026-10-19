// src/options/components/ProviderForm.tsx — form per-provider thật (GĐ2; FSD §3.4 Màn 2 #1).
// Trường hiển thị theo provider; validate BR-15/SR-06 ở SW (validateProviderConfig); key để trống = giữ
// key đã lưu (BR-08 merge ở SW); custom origin → chrome.permissions.request lúc lưu (SR-05/BR-05 §8.3).
import { useEffect, useState } from "react";
import type { LLMConfig, ProviderId } from "../../shared/llm/types";
import { requestOrigin } from "../../shared/llm/permissions";
import { PROVIDER_IDS } from "../../shared/storage-schema";
import { t } from "../../shared/i18n";
import type { ConfigData } from "../useConfigData";
import { sendMessage } from "../../shared/messaging";

interface Props {
  config: ConfigData;
  draft: LLMConfig | null;
  onDraft: (next: LLMConfig) => void;
}

const MODEL_PRESETS: Record<ProviderId, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"],
  azure: [""],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  "openai-compatible": ["gpt-4o", "gpt-4o-mini", "qwen-text", "llama-3-70b"],
  local: ["qwen-text", "llama-3-8b", "mistral-7b"]
};

export function ProviderForm(props: Props): JSX.Element {
  const { config, draft, onDraft } = props;
  const active: ProviderId = config.data?.activeProvider ?? "openai";
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const hasKey = config.data?.providers[active]?.hasKey ?? false;
  const [modelList, setModelList] = useState<string[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      if (!draft) return;
      try {
        const response = await sendMessage<{ models: string[] }>("LIST_MODELS", { config: draft });
        if (response.models && response.models.length > 0) {
          setModelList(response.models);
        } else {
          setModelList(MODEL_PRESETS[active] ?? []);
        }
      } catch {
        setModelList(MODEL_PRESETS[active] ?? []);
      }
    };
    fetchModels();
  }, [active, draft?.apiKey, draft?.baseUrl, draft?.local?.url]);

  const save = async (): Promise<void> => {
    if (!draft) return;
    const payload = active === "azure" && draft.azure ? { ...draft, model: draft.azure.deployment || draft.model } : draft;
    setStatus("saving");
    try {
      await config.setProvider(active, payload);
      await requestOptionalPermission(payload);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="provider-form">
      <label className="field">
        <span>{t("options.provider.provider")}</span>
        <select value={active} onChange={(event) => void config.setActiveProvider(event.target.value as ProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>
      <p className="note">{t("options.provider.activeHint")}</p>
      {draft !== null && <ProviderFields provider={active} draft={draft} hasKey={hasKey} onDraft={onDraft} modelList={modelList} />}
      <button type="button" disabled={status === "saving" || draft === null} onClick={() => void save()}>
        {status === "saving" ? t("options.provider.saving") : t("options.provider.save")}
      </button>
      {status === "saved" && <p className="note ok">{t("options.provider.saved")}</p>}
      {status === "failed" && <p className="warning">{t("options.provider.saveFailed")}</p>}
    </div>
  );
}

async function requestOptionalPermission(config: LLMConfig): Promise<void> {
  const origin = requestOrigin(config);
  if (origin === null) return;
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) console.warn("[AIMH][options] permission denied for " + origin);
}

function ProviderFields(props: { provider: ProviderId; draft: LLMConfig; hasKey: boolean; onDraft: (next: LLMConfig) => void; modelList: string[] }): JSX.Element {
  const { provider, draft, hasKey, onDraft, modelList } = props;
  
  const modelListId = `model-list-${provider}`;
  
  const keyField = (
    <label className="field">
      <span>{t("options.provider.apiKey")}</span>
      <input
        type="password"
        value={draft.apiKey ?? ""}
        placeholder={hasKey ? "••••••••" : ""}
        onChange={(event) => onDraft({ ...draft, apiKey: event.target.value })}
      />
      {hasKey && <small className="hint">{t("options.provider.apiKeyKeepHint")}</small>}
    </label>
  );
  
  const modelField = (
    <label className="field">
      <span>{t("options.provider.model")}</span>
      <input
        list={modelListId}
        type="text"
        value={draft.model}
        onChange={(event) => onDraft({ ...draft, model: event.target.value })}
      />
      <datalist id={modelListId}>
        {modelList.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </datalist>
    </label>
  );
  
  const cloud = provider === "openai" || provider === "anthropic" || provider === "gemini";
  if (cloud) return <>{keyField}{modelField}</>;
  if (provider === "azure") return <>{keyField}{azureFields(draft, onDraft)}</>;
  if (provider === "openai-compatible") return <>{keyField}{modelField}{baseUrlField(draft, onDraft)}</>;
  return <>{localFields(draft, onDraft)}{modelField}</>;
}

function azureFields(draft: LLMConfig, onDraft: (next: LLMConfig) => void): JSX.Element {
  const azure = draft.azure ?? { endpoint: "", deployment: "", apiVersion: "" };
  const update = (patch: Partial<typeof azure>): void => onDraft({ ...draft, azure: { ...azure, ...patch } });
  return (
    <>
      <label className="field"><span>{t("options.provider.endpoint")}</span>
        <input type="url" value={azure.endpoint} onChange={(e) => update({ endpoint: e.target.value })} />
        <PermissionWarning draft={draft} />
      </label>
      <label className="field"><span>{t("options.provider.deployment")}</span>
        <input type="text" value={azure.deployment} onChange={(e) => update({ deployment: e.target.value })} /></label>
      <label className="field"><span>{t("options.provider.apiVersion")}</span>
        <input type="text" value={azure.apiVersion} onChange={(e) => update({ apiVersion: e.target.value })} /></label>
    </>
  );
}

function baseUrlField(draft: LLMConfig, onDraft: (next: LLMConfig) => void): JSX.Element {
  return (
    <label className="field"><span>{t("options.provider.baseUrl")}</span>
      <input type="url" value={draft.baseUrl ?? ""} onChange={(e) => onDraft({ ...draft, baseUrl: e.target.value })} />
      <PermissionWarning draft={draft} />
    </label>
  );
}

function localFields(draft: LLMConfig, onDraft: (next: LLMConfig) => void): JSX.Element {
  const local = draft.local ?? { url: "http://localhost:11434", preset: "ollama" as const };
  const update = (patch: Partial<typeof local>): void => onDraft({ ...draft, local: { ...local, ...patch } });
  return (
    <>
      <label className="field"><span>{t("options.provider.preset")}</span>
        <select value={local.preset} onChange={(e) => {
          const preset = e.target.value as "ollama" | "lmstudio";
          update({ preset: preset, url: preset === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1" });
        }}>
          <option value="ollama">{t("options.provider.preset.ollama")}</option>
          <option value="lmstudio">{t("options.provider.preset.lmstudio")}</option>
        </select></label>
      <label className="field"><span>{t("options.provider.localUrl")}</span>
        <input type="url" value={local.url} onChange={(e) => update({ url: e.target.value })} />
        <PermissionWarning draft={draft} />
      </label>
    </>
  );
}

function PermissionWarning(props: { draft: LLMConfig }): JSX.Element | null {
  const origin = requestOrigin(props.draft);
  if (origin === null) return null;
  return <small className="hint">{t("options.provider.permissionWarning", { origin })}</small>;
}
