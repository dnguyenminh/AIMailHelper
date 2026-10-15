// src/options/components/AutomationRules.tsx — UI quản lý luật auto-reply (UAT 15/10, chọn B;
// mở rộng field theo chuẩn Outlook Rules: sender/subject/body/to/cc/hasAttachment/importance).
// Rule = khớp MỌI điều kiện đã điền (automode-rules.ts). BR-13 fail-closed: rule không có
// criteria → KHÔNG khớp → UI chặn thêm.
import { useState } from "react";
import { t } from "../../shared/i18n";
import type { AutoModeRule } from "../../shared/types";

export function AutomationRules(props: {
  rules: AutoModeRule[];
  onChange: (rules: AutoModeRule[]) => void;
}): JSX.Element {
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [hasAttachment, setHasAttachment] = useState(false);
  const [importance, setImportance] = useState("");
  const [note, setNote] = useState<"idle" | "added" | "deleted" | "needCriteria">("idle");

  const add = (): void => {
    const senderPattern = sender.trim();
    const subjectPattern = subject.trim();
    const bodyPattern = body.trim();
    const toPattern = to.trim();
    const ccPattern = cc.trim();
    const parsed = Number.parseInt(importance, 10);
    const minImportance = Number.isNaN(parsed) ? undefined : Math.min(100, Math.max(0, parsed));
    const hasCriteria =
      senderPattern.length > 0 ||
      subjectPattern.length > 0 ||
      bodyPattern.length > 0 ||
      toPattern.length > 0 ||
      ccPattern.length > 0 ||
      hasAttachment ||
      minImportance !== undefined;
    if (!hasCriteria) {
      setNote("needCriteria"); // BR-13 — rule rỗng không bao giờ khớp
      return;
    }
    const rule: AutoModeRule = {};
    if (senderPattern.length > 0) rule.senderPattern = senderPattern;
    if (subjectPattern.length > 0) rule.subjectPattern = subjectPattern;
    if (bodyPattern.length > 0) rule.bodyPattern = bodyPattern;
    if (toPattern.length > 0) rule.toPattern = toPattern;
    if (ccPattern.length > 0) rule.ccPattern = ccPattern;
    if (hasAttachment) rule.hasAttachment = true;
    if (minImportance !== undefined) rule.minImportance = minImportance;
    props.onChange([...props.rules, rule]);
    setSender("");
    setSubject("");
    setBody("");
    setTo("");
    setCc("");
    setHasAttachment(false);
    setImportance("");
    setNote("added");
  };

  const remove = (index: number): void => {
    props.onChange(props.rules.filter((_, i) => i !== index));
    setNote("deleted");
  };

  const describe = (rule: AutoModeRule): string => {
    const parts: string[] = [];
    if (rule.senderPattern !== undefined) parts.push('sender ∋ "' + rule.senderPattern + '"');
    if (rule.subjectPattern !== undefined) parts.push('subject ∋ "' + rule.subjectPattern + '"');
    if (rule.bodyPattern !== undefined) parts.push('body ∋ "' + rule.bodyPattern + '"');
    if (rule.toPattern !== undefined) parts.push('to ∋ "' + rule.toPattern + '"');
    if (rule.ccPattern !== undefined) parts.push('cc ∋ "' + rule.ccPattern + '"');
    if (rule.hasAttachment === true) parts.push("có đính kèm");
    if (rule.minImportance !== undefined) parts.push("importance ≥ " + rule.minImportance);
    return parts.join(" · ");
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
              <span className="rules-desc">{describe(rule)}</span>
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
          <span>{t("options.automation.rules.body")}</span>
          <input type="text" value={body} onChange={(e) => setBody(e.target.value)} placeholder="khảo sát" />
        </label>
        <label className="field">
          <span>{t("options.automation.rules.to")}</span>
          <input type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="duc.nguyen" />
        </label>
        <label className="field">
          <span>{t("options.automation.rules.cc")}</span>
          <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="OPS RISK" />
        </label>
        <label className="field row">
          <input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} />
          <span>{t("options.automation.rules.hasAttachment")}</span>
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
