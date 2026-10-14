// src/content/components/Panel/ReplySection.tsx — UC-02 (FR-GD4-01..03, 07; AF-5; EF-5; BR-10).
// tone/language/extraInstructions → stream draft qua Port "reply" → preview → "Chèn vào Reply"
// (disabled khi draft rỗng — BR-10) → needs-confirm (AF-5) / warning khác email (EF-5) →
// ERR-09/EF-2 → giữ preview + gợi ý copy tay (FR-GD4-07).
import { useEffect, useRef, useState } from "react";
import { t } from "../../../shared/i18n";
import { storage } from "../../../shared/storage";
import { REPLY_LANGUAGES, REPLY_TONES } from "../../../shared/storage-schema";
import type { EmailData, ReplyLanguage, ReplyTone } from "../../../shared/types";
import { createReplyController } from "../../modules/reply";
import type { ReplyUiState } from "../../modules/reply";
import { ErrorBanner } from "./ErrorBanner";

export function ReplySection(props: { email: EmailData | null }): JSX.Element | null {
  const [state, setState] = useState<ReplyUiState>({ status: "idle", draft: "", error: null, mismatch: false });
  const [tone, setTone] = useState<ReplyTone>("chinh-thuc");
  const [language, setLanguage] = useState<ReplyLanguage>("auto");
  const [extra, setExtra] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null); // AF-5 — nội dung sẵn
  const controllerRef = useRef<ReturnType<typeof createReplyController> | null>(null);

  useEffect(() => {
    controllerRef.current = createReplyController(setState);
    void storage
      .getPrompts()
      .then((prompts) => {
        setTone(prompts.defaultTone); // mặc định theo PROMPT_SETTINGS (CONFIG_SET section prompts)
        setLanguage(prompts.replyLanguage);
      })
      .catch(() => undefined); // storage hỏng → giữ defaults fail-closed
    return () => controllerRef.current?.cancel();
  }, []);

  const start = (): void => {
    setNeedsConfirm(null);
    controllerRef.current?.start(props.email as EmailData, { tone: tone, language: language, extraInstructions: extra.trim() });
  };

  const insert = async (decision?: "replace" | "append"): Promise<void> => {
    const outcome = await controllerRef.current?.insert(undefined, decision);
    if (outcome && outcome.kind === "needs-confirm") setNeedsConfirm(outcome.existing); // AF-5
  };

  const onInsert = (): void => {
    void insert();
  };

  const onDecide = (decision: "replace" | "append"): void => {
    setNeedsConfirm(null);
    void insert(decision);
  };

  const onInsertAnyway = async (): Promise<void> => {
    const outcome = await controllerRef.current?.insertAnyway();
    const confirmed = outcome && outcome.kind === "needs-confirm" ? outcome : null; // AF-5 sau EF-5
    if (confirmed) setNeedsConfirm(confirmed.existing);
  };

  const email = props.email;
  if (email === null) return null; // UC-02 preconditions — cần email đã analyze
  const streaming = state.status === "streaming";
  const insertDisabled = state.draft.trim().length === 0 || streaming; // BR-10

  return (
    <div className="aimh-reply">
      <p className="aimh-heading">{t("panel.reply.title")}</p>
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
      <div className="aimh-panel-actions">
        <button type="button" className="aimh-btn aimh-btn-primary" disabled={streaming} onClick={start}>
          {streaming ? t("panel.reply.generating") : t("panel.analyze.replyButton")}
        </button>
        {streaming && (
          <button type="button" className="aimh-btn" onClick={() => controllerRef.current?.cancel()}>{t("panel.analyze.stop")}</button>
        )}
        <button type="button" className="aimh-btn" disabled={insertDisabled} onClick={onInsert} title={t("panel.reply.insert")}>
          {t("panel.reply.insert")}
        </button>
      </div>
      {(state.draft.length > 0 || state.status !== "idle") && (
        <pre className="aimh-stream" aria-label={t("panel.reply.preview")}>{state.draft || (streaming ? "…" : "")}</pre>
      )}
      {state.status === "error" && state.error !== null && (
        <>
          <ErrorBanner error={{ ...state.error, ef6Raw: undefined }} onRetry={() => controllerRef.current?.retry()} />
          <p className="aimh-note">{t("panel.reply.copyHint")}</p>
        </>
      )}
      {needsConfirm !== null && (
        <div className="aimh-warning" role="alertdialog" aria-label={t("panel.reply.needsConfirm")}>
          <p className="aimh-note">{t("panel.reply.needsConfirm")}</p>
          <div className="aimh-panel-actions">
            <button type="button" className="aimh-btn" onClick={() => onDecide("replace")}>{t("panel.reply.replace")}</button>
            <button type="button" className="aimh-btn" onClick={() => onDecide("append")}>{t("panel.reply.append")}</button>
            <button type="button" className="aimh-btn" onClick={() => setNeedsConfirm(null)}>{t("panel.reply.cancel")}</button>
          </div>
        </div>
      )}
      {state.mismatch && (
        <div className="aimh-warning" role="alert">
          <p className="aimh-note">{t("panel.reply.mismatch")}</p>
          <div className="aimh-panel-actions">
            <button type="button" className="aimh-btn" onClick={() => void onInsertAnyway()}>{t("panel.reply.insertAnyway")}</button>
            <button type="button" className="aimh-btn" onClick={() => controllerRef.current?.dismissMismatch()}>{t("panel.reply.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
