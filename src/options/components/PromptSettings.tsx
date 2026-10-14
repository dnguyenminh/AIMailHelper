// src/options/components/PromptSettings.tsx — custom prompt + tone + replyLanguage (GĐ2; BR-11).
// customSystemPrompt null khi rỗng; validate enum ở SW (BR-15); save qua CONFIG_SET section prompts.
import { useEffect, useState } from "react";
import { t } from "../../shared/i18n";
import type { ConfigData } from "../useConfigData";
import type { PromptsConfig, ReplyLanguage, ReplyTone } from "../../shared/types";
import { REPLY_LANGUAGES, REPLY_TONES } from "../../shared/storage-schema";

export function PromptSettings(props: { config: ConfigData }): JSX.Element {
  const stored = props.config.data?.prompts ?? null;
  const [draft, setDraft] = useState<PromptsConfig>({ customSystemPrompt: null, defaultTone: "chinh-thuc", replyLanguage: "auto" });
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    if (stored) setDraft(stored); // reload sau save → sync lại từ SW
  }, [stored]);

  const save = async (): Promise<void> => {
    try {
      const custom = draft.customSystemPrompt?.trim();
      await props.config.setPrompts({ ...draft, customSystemPrompt: custom !== undefined && custom.length > 0 ? custom : null });
      setStatus("saved");
    } catch {
      setStatus("failed"); // enum sai bị từ chối BR-15 — không âm thầm sửa
    }
  };

  return (
    <div className="prompt-settings">
      <label className="field">
        <span>{t("options.prompts.customSystemPrompt")}</span>
        <textarea
          rows={3}
          value={draft.customSystemPrompt ?? ""}
          onChange={(event) => setDraft({ ...draft, customSystemPrompt: event.target.value })}
        />
        <small className="hint">{t("options.prompts.customHint")}</small>
      </label>
      <label className="field">
        <span>{t("options.prompts.defaultTone")}</span>
        <select value={draft.defaultTone} onChange={(event) => setDraft({ ...draft, defaultTone: event.target.value as ReplyTone })}>
          {REPLY_TONES.map((tone) => <option key={tone} value={tone}>{t("options.prompts.tone." + tone)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t("options.prompts.replyLanguage")}</span>
        <select value={draft.replyLanguage} onChange={(event) => setDraft({ ...draft, replyLanguage: event.target.value as ReplyLanguage })}>
          {REPLY_LANGUAGES.map((language) => <option key={language} value={language}>{t("options.prompts.language." + language)}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => void save()}>{t("options.prompts.save")}</button>
      {status === "saved" && <p className="note ok">{t("options.prompts.saved")}</p>}
      {status === "failed" && <p className="warning">{t("errors.badRequest")}</p>}
    </div>
  );
}
