// src/options/components/ProviderForm.tsx — form per-provider thật (GĐ2; FSD §3.4 Màn 2 #1).
// Trường hiển thị theo provider; validate BR-15/SR-06 ở SW (validateProviderConfig); key để trống = giữ
// key đã lưu (BR-08 merge ở SW); custom origin → chrome.permissions.request lúc lưu (SR-05/BR-05 §8.3).
import { useState } from "react";
import type { LLMConfig, ProviderId } from "../../shared/llm/types";
import { requestOrigin } from "../../shared/llm/permissions";
import { PROVIDER_IDS } from "../../shared/storage-schema";
import { t } from "../../shared/i18n";
import type { ConfigData } from "../useConfigData";

interface Props {
  config: ConfigData;
  draft: LLMConfig | null; // draft sở hữu bởi App — dùng chung với ModelPicker/TestConnection
  onDraft: (next: LLMConfig) => void;
}

export function ProviderForm(props: Props): JSX.Element {
  const { config, draft, onDraft } = props;
  const active: ProviderId = config.data?.activeProvider ?? "openai";
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const hasKey = config.data?.providers[active]?.hasKey ?? false;

  const save = async (): Promise<void> => {
    if (!draft) return;
    // Azure: model ≡ deployment (body KHÔNG có trường model — 5.2.2); giữ validation model non-empty.
    const payload = active === "azure" && draft.azure ? { ...draft, model: draft.azure.deployment || draft.model } : draft;
    setStatus("saving");
    try {
      await config.setProvider(active, payload);
      await requestOptionalPermission(payload); // SR-05 — xin permission tại thao tác lưu (user gesture)
      setStatus("saved");
    } catch {
      setStatus("failed"); // chi tiết (ERR-15 field/…) chỉ log phía SW — không chứa key (BR-08)
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
      {draft !== null && <ProviderFields provider={active} draft={draft} hasKey={hasKey} onDraft={onDraft} />}
      <button type="button" disabled={status === "saving" || draft === null} onClick={() => void save()}>
        {status === "saving" ? t("options.provider.saving") : t("options.provider.save")}
      </button>
      {status === "saved" && <p className="note ok">{t("options.provider.saved")}</p>}
      {status === "failed" && <p className="warning">{t("options.provider.saveFailed")}</p>}
    </div>
  );
}

// SR-05/BR-05: xin optional host permission NGAY lúc lưu (user gesture) cho custom/local origin;
// từ chối → warn console; lần gọi fetch sau SW check contains → ERR-14 (§8.3).
async function requestOptionalPermission(config: LLMConfig): Promise<void> {
  const origin = requestOrigin(config);
  if (origin === null) return; // 4 provider cloud đã có host_permissions tĩnh
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) console.warn("[AIMH][options] permission denied for " + origin);
}

function ProviderFields(props: { provider: ProviderId; draft: LLMConfig; hasKey: boolean; onDraft: (next: LLMConfig) => void }): JSX.Element {
  const { provider, draft, hasKey, onDraft } = props;
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
      <input type="text" value={draft.model} onChange={(event) => onDraft({ ...draft, model: event.target.value })} />
    </label>
  );
  const cloud = provider === "openai" || provider === "anthropic" || provider === "gemini";
  if (cloud) return <>{keyField}{modelField}</>;
  if (provider === "azure") return <>{keyField}{azureFields(draft, onDraft)}</>; // model ≡ deployment — không hiện
  if (provider === "openai-compatible") return <>{keyField}{modelField}{baseUrlField(draft, onDraft)}</>;
  return <>{localFields(draft, onDraft)}{modelField}</>; // local: KHÔNG key (5.2.6)
}

function azureFields(draft: LLMConfig, onDraft: (next: LLMConfig) => void): JSX.Element {
  const azure = draft.azure ?? { endpoint: "", deployment: "", apiVersion: "" };
  const update = (patch: Partial<typeof azure>): void => onDraft({ ...draft, azure: { ...azure, ...patch } });
  return (
    <>
      <label className="field"><span>{t("options.provider.endpoint")}</span>
        <input type="url" value={azure.endpoint} onChange={(e) => update({ endpoint: e.target.value })} /></label>
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
      <input type="url" value={draft.baseUrl ?? ""} onChange={(e) => onDraft({ ...draft, baseUrl: e.target.value })} /></label>
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
          // FR-GD2-07 — preset 1-click: url chuẩn theo preset (5.2.6)
          update({ preset: preset, url: preset === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1" });
        }}>
          <option value="ollama">{t("options.provider.preset.ollama")}</option>
          <option value="lmstudio">{t("options.provider.preset.lmstudio")}</option>
        </select></label>
      <label className="field"><span>{t("options.provider.localUrl")}</span>
        <input type="url" value={local.url} onChange={(e) => update({ url: e.target.value })} /></label>
    </>
  );
}
