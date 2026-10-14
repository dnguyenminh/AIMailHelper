// src/options/App.tsx — Màn 2 Options dashboard: 6 section shell (FSD §3.4; PLAN.md mục 4).
// GĐ1: form DISABLED/stub — GĐ2 điền ProviderForm/ModelPicker/TestConnection/PromptSettings/AutomationSettings.
import { t } from "../shared/i18n";
import { useUiLanguage } from "../shared/i18n/react";
import { AutomationSettings } from "./components/AutomationSettings";
import { GeneralSettings } from "./components/GeneralSettings";
import { ModelPicker } from "./components/ModelPicker";
import { PromptSettings } from "./components/PromptSettings";
import { ProviderForm } from "./components/ProviderForm";
import { TestConnection } from "./components/TestConnection";

export function App() {
  useUiLanguage(); // UC-08: đổi ngôn ngữ → re-render toàn trang
  return (
    <main className="options">
      <h1 className="options-title">{t("options.title")}</h1>
      <section className="card">
        <h2>{t("options.section.provider")}</h2>
        <ProviderForm />
      </section>
      <section className="card">
        <h2>{t("options.section.model")}</h2>
        <ModelPicker />
      </section>
      <section className="card">
        <h2>{t("options.section.testConnection")}</h2>
        <TestConnection />
      </section>
      <section className="card">
        <h2>{t("options.section.prompts")}</h2>
        <PromptSettings />
      </section>
      <section className="card">
        <h2>{t("options.section.automation")}</h2>
        <AutomationSettings />
      </section>
      <section className="card">
        <h2>{t("options.section.general")}</h2>
        <GeneralSettings />
      </section>
    </main>
  );
}
