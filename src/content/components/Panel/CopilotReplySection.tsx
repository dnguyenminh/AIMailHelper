// src/content/components/Panel/CopilotReplySection.tsx — uat93 (24/10): SOẠN REPLY bằng Copilot
// (Hướng A). Chỉ hiện ở view Copilot: prompt tone/ngôn ngữ/hướng dẫn → SW gõ vào ô
// "Message Copilot" (trusted input) → poll nháp → Panel đưa vào ReplySection để chèn.
// KHÔNG tự gửi mail (BR-01) — chèn vẫn qua nút "Chèn vào Reply" như UC-02.
import { useEffect, useRef, useState } from "react";
import { t } from "../../../shared/i18n";
import { storage } from "../../../shared/storage";
import { REPLY_LANGUAGES, REPLY_TONES } from "../../../shared/storage-schema";
import type { ReplyLanguage, ReplyTone } from "../../../shared/types";
import { generateReplyViaCopilot } from "../../owa-adapter/copilot-reply";

export function CopilotReplySection(props: { onDraft: (draft: string) => void }): JSX.Element | null {
  const [tone, setTone] = useState<ReplyTone>("chinh-thuc");
  const [language, setLanguage] = useState<ReplyLanguage>("auto");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void storage
      .getPrompts()
      .then((prompts) => {
        if (!mounted.current) return;
        setTone(prompts.defaultTone); // cùng mặc định với ReplySection (PROMPT_SETTINGS)
        setLanguage(prompts.replyLanguage);
      })
      .catch(() => undefined); // storage hỏng → defaults fail-closed
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll tối đa 90s tự kết thúc (POLL_ROUNDS) — không cần nút Dừng; lock nút khi đang chạy.
  const onCompose = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await generateReplyViaCopilot({ tone: tone, language: language, extra: extra.trim() });
    if (!mounted.current) return;
    setBusy(false);
    if (outcome.ok) {
      props.onDraft(outcome.draft);
      return;
    }
    setError(outcome.reason === "no-copilot-target" ? t("panel.copilotReply.noPanel") : t("panel.copilotReply.failed"));
  };

  return (
    <div className="aimh-reply">
      <p className="aimh-heading">{t("panel.copilotReply.title")}</p>
      <div className="aimh-row">
        <select className="aimh-input" value={tone} onChange={(e) => setTone(e.target.value as ReplyTone)} aria-label={t("panel.reply.tone")}>
          {REPLY_TONES.map((value) => <option key={value} value={value}>{t("options.prompts.tone." + value)}</option>)}
        </select>
        <select className="aimh-input" value={language} onChange={(e) => setLanguage(e.target.value as ReplyLanguage)} aria-label={t("panel.reply.language")}>
          {REPLY_LANGUAGES.map((value) => <option key={value} value={value}>{t("options.prompts.language." + value)}</option>)}
        </select>
      </div>
      <textarea
        className="aimh-input"
        rows={2}
        placeholder={t("panel.reply.extra")}
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
      />
      <button type="button" className="aimh-btn aimh-btn-primary" disabled={busy} onClick={() => void onCompose()}>
        {busy ? t("panel.copilotReply.busy") : t("panel.copilotReply.button")}
      </button>
      {error !== null && <p className="aimh-note">{error}</p>}
    </div>
  );
}
