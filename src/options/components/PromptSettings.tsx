// src/options/components/PromptSettings.tsx — custom prompt + tone + replyLanguage (GĐ1 stub → GĐ2; BR-11).
import { t } from "../../shared/i18n";

export function PromptSettings() {
  return (
    <div className="form-stub">
      <label className="field">
        <span>{t("options.prompts.customSystemPrompt")}</span>
        <textarea rows={3} disabled />
      </label>
      <label className="field">
        <span>{t("options.prompts.defaultTone")}</span>
        <select disabled>
          <option>—</option>
        </select>
      </label>
      <label className="field">
        <span>{t("options.prompts.replyLanguage")}</span>
        <select disabled>
          <option>—</option>
        </select>
      </label>
      <p className="note">{t("options.comingSoon", { phase: "GĐ2" })}</p>
    </div>
  );
}
