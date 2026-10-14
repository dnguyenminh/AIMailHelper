// src/options/components/ModelPicker.tsx — dropdown fetch listModels + ô nhập tay LUÔN khả dụng (GĐ2; BR-17).
// Azure ẨN nút fetch (deployment ≠ model id — 5.2.2); Anthropic hiển thị note CORS spike (Open Issue #2);
// lỗi fetch KHÔNG chặn lưu cấu hình (BR-17) — chỉ hiện note.
import { useState } from "react";
import type { LLMConfig, ProviderId } from "../../shared/llm/types";
import { sendMessage } from "../../shared/messaging";
import { t } from "../../shared/i18n";

interface FetchState {
  phase: "idle" | "loading" | "done" | "failed" | "unsupported";
  models: string[];
  count: number;
}

export function ModelPicker(props: { draft: LLMConfig; activeProvider: ProviderId; onDraft: (next: LLMConfig) => void }): JSX.Element {
  const { draft, activeProvider, onDraft } = props;
  const [state, setState] = useState<FetchState>({ phase: "idle", models: [], count: 0 });

  const supportsFetch = activeProvider !== "azure"; // BR-17 — ModelPicker ẩn fetch cho Azure
  const isAnthropic = activeProvider === "anthropic";

  const fetchModels = async (): Promise<void> => {
    setState({ phase: "loading", models: [], count: 0 });
    try {
      const response = await sendMessage<{ models: string[] }>("LIST_MODELS", { config: draft });
      setState({ phase: "done", models: response.models, count: response.models.length });
    } catch (error) {
      // LIST_MODELS fail → models rỗng + error — KHÔNG chặn lưu (BR-17); azure chỉ throw khi bấm (defensive)
      const unsupported = isModelsUnsupported(error);
      setState({ phase: unsupported ? "unsupported" : "failed", models: [], count: 0 });
    }
  };

  return (
    <div className="model-picker">
      {supportsFetch && (
        <>
          <button type="button" disabled={state.phase === "loading"} onClick={() => void fetchModels()}>
            {state.phase === "loading" ? t("options.model.fetching") : t("options.model.fetch")}
          </button>
          {isAnthropic && <p className="note">{t("options.model.anthropicCorsNote")}</p>}
          {state.phase === "done" && <p className="note ok">{t("options.model.fetched", { count: String(state.models.length) })}</p>}
          {state.phase === "failed" && <p className="warning">{t("options.model.fetchFailed")}</p>}
          {state.models.length > 0 && (
            <label className="field">
              <span>{t("options.model.pickLabel")}</span>
              <select value={state.models.includes(draft.model) ? draft.model : ""} onChange={(e) => onDraft({ ...draft, model: e.target.value })}>
                <option value="">—</option>
                {state.models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      {(!supportsFetch || state.phase === "unsupported") && <p className="note">{t("options.model.noFetchSupport")}</p>}
      <label className="field">
        <span>{t("options.model.manual")}</span>
        <input type="text" value={draft.model} onChange={(e) => onDraft({ ...draft, model: e.target.value })} />
      </label>
    </div>
  );
}

function isModelsUnsupported(error: unknown): boolean {
  return error instanceof Error && "i18nKey" in error && (error as { i18nKey?: string }).i18nKey === "errors.modelsNotSupported";
}
