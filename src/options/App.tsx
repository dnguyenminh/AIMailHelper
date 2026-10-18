// src/options/App.tsx — Màn 2 Options dashboard: 6 section thật + chat test (FSD §3.4; GĐ2).
// App sở hữu draft LLMConfig: ProviderForm/ModelPicker/TestConnection cùng nhìn 1 draft (config
// snapshot — UC-05 EF-6); ChatTest dùng provider active đã lưu phía SW (key không qua UI — BR-08).
import { useEffect, useState } from "react";
import type { LLMConfig, ProviderId } from "../shared/llm/types";
import { useUiLanguage } from "../shared/i18n/react";
import { t } from "../shared/i18n";
import { AutomationSettings } from "./components/AutomationSettings";
import { ChatTest } from "./components/ChatTest";
import { GeneralSettings } from "./components/GeneralSettings";
import { ModelPicker } from "./components/ModelPicker";
import { PromptSettings } from "./components/PromptSettings";
import { ProviderForm } from "./components/ProviderForm";
import { TestConnection } from "./components/TestConnection";
import { VisionModelPicker } from "./components/VisionModelPicker";
import { VisionSettings } from "./components/VisionSettings";
import { defaultDraftFor, useConfigData } from "./useConfigData";

export function App() {
  useUiLanguage(); // UC-08: đổi ngôn ngữ → re-render toàn trang
  const config = useConfigData();
  const active: ProviderId = config.data?.activeProvider ?? "openai";
  const loaded = config.data !== null;
  const [draft, setDraft] = useState<LLMConfig | null>(null);

  // Init/reset draft khi load xong hoặc ĐỔI provider active — prefill từ config đã lưu (phi nhạy cảm,
  // apiKey rỗng = giữ key đã lưu BR-08) hoặc template mặc định. Không reset khi reload thường (giữ typing).
  useEffect(() => {
    if (!loaded) return;
    const stored = config.data?.providers[active]?.config ?? null;
    setDraft({ ...(stored ?? defaultDraftFor(active)), apiKey: "" } as LLMConfig);
    // deps [loaded, active] chủ ý: KHÔNG reset draft khi reload thường (giữ input đang gõ của user)
  }, [loaded, active]);

  return (
    <main className="options">
      <h1 className="options-title">{t("options.title")}</h1>
      <section className="card">
        <h2>{t("options.section.provider")}</h2>
        <ProviderForm config={config} draft={draft} onDraft={setDraft} />
      </section>
      <section className="card">
        <h2>{t("options.section.model")}</h2>
        <ModelPicker draft={draft ?? { provider: active, model: "" }} activeProvider={active} onDraft={setDraft} />
      </section>
      <section className="card">
        <h2>{t("options.section.visionModel")}</h2>
        <VisionModelPicker
          draft={draft}
          config={config}
          onDraft={(next) => setDraft((prev) => prev ? { ...prev, vision: next.vision } : null)} />
      </section>
      <section className="card">
        <h2>{t("options.section.testConnection")}</h2>
        <TestConnection draft={draft} hasStoredConfig={config.data?.providers[active]?.config !== null && config.data !== null} />
      </section>
      <section className="card">
        <h2>{t("options.section.chatTest")}</h2>
        <ChatTest config={config} />
      </section>
      <section className="card">
        <h2>{t("options.section.prompts")}</h2>
        <PromptSettings config={config} />
      </section>
      <section className="card">
        <h2>{t("options.section.vision")}</h2>
        <VisionSettings config={config} />
      </section>
      <section className="card">
        <h2>{t("options.section.automation")}</h2>
        <AutomationSettings config={config} />
      </section>
      <section className="card">
        <h2>{t("options.section.general")}</h2>
        <GeneralSettings config={config} />
      </section>
    </main>
  );
}
