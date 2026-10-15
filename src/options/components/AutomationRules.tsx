// src/options/components/AutomationRules.tsx — UI quản lý luật auto-reply (UAT 15/10, chọn B).
// Rule = { senderPattern?, subjectPattern?, minImportance? } — khớp MỌI điều kiện đã điền
// (automode-rules.ts). BR-13 fail-closed: rule không có criteria → KHÔNG khớp → UI chặn thêm.
import { useState } from "react";
import { t } from "../../shared/i18n";
import type { AutoModeRule } from "../../shared/types";

export function AutomationRules(props: {
  rules: AutoModeRule[];
  onChange: (rules: AutoModeRule[]) => void;
}): JSX.Element {
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [importance, setImportance] = useState("");
  const [note, setNote] = useState<"idle" | "added" | "deleted" | "needCriteria">("idle");

  const add = (): void => {
    const senderPattern = sender.trim();
    const subjectPattern = subject.trim();
    const parsed = Number.parseInt(importance, 10);
    const minImportance = Number.isNaN(parsed) ? undefined : Math.min(100, Math.max(0, parsed));
    if (senderPattern.length === 0 && subjectPattern.length === 0 && minImportance === undefined) {
      setNote("needCriteria"); // BR-13 — rule rỗng không bao giờ khớp
      return;
    }
    const rule: AutoModeRule = {};
    if (senderPattern.length > 0) rule.senderPattern = senderPattern;
    if (subjectPattern.length > 0) rule.subjectPattern = subjectPattern;
    if (minImportance !== undefined) rule.minImportance = minImportance;
    props.onChange([...props.rules, rule]);
    setSender("");
    setSubject("");
    setImportance("");
    setNote("added");
  };

  const remove = (index: number): void => {
    props.onChange(props.rules.filter((_, i) => i !== index));
    setNote("deleted");
  };

  return (
    <div className="automation-rules">
      <p className="aimh-heading">{t("options.automation.rules.title")}</p>
      <p className="note">{t("options.automation.rules.hint")}</p>
      {props.rules.length === 0 ? (
        <p className="note">{t("options.automation.rules.empty")}</p>
      ) : (
        <ul className="rules-list">
          {props.rules.map((rule, index) => (
            <li key={index} className="rules-row">
              <span className="rules-desc">
                {rule.senderPattern !== undefined && <span>sender ∋ "{rule.senderPattern}" </span>}
                {rule.subjectPattern !== undefined && <span>subject ∋ "{rule.subjectPattern}" </span>}
                {rule.minImportance !== undefined && <span>importance ≥ {rule.minImportance}</span>}
              </span>
              <button type="button" className="rules-delete" onClick={() => remove(index)}>
                {t("options.automation.rules.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rules-form">
        <label className="field">
          <span>{t("options.automation.rules.sender")}</span>
          <input type="text" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="csm_noreply" />
        </label>
        <label className="field">
          <span>{t("options.automation.rules.subject")}</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="PROD DEPLOYMENT"
          />
        </label>
        <label className="field">
          <span>{t("options.automation.rules.minImportance")}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            placeholder="70"
          />
        </label>
        <button type="button" className="rules-add" onClick={add}>
          {t("options.automation.rules.add")}
        </button>
      </div>
      {note === "needCriteria" && <p className="warning">{t("options.automation.rules.needCriteria")}</p>}
      {note === "added" && <p className="note ok">{t("options.automation.rules.added")}</p>}
      {note === "deleted" && <p className="note ok">{t("options.automation.rules.deleted")}</p>}
    </div>
  );
}
