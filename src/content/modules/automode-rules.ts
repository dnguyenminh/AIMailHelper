// src/content/modules/automode-rules.ts — rule engine thuần (TDD §3.7 GĐ6; FR-GD6-03; BR-13).
// Rule khớp khi MỌI field được định nghĩa đều khớp: senderPattern/subjectPattern so khớp
// KHÔNG phân biệt hoa thường (TC-119: "invoice" khớp "INVOICE #123"); minImportance:
// importanceScore >= ngưỡng (biên 69/70 — TC-119 #4). Fail-closed BR-13: rules rỗng HOẶC
// rule không định nghĩa field nào → KHÔNG khớp (chỉ analyze — caller vẫn phải gate trước).
import type { AnalysisResult, AutoModeRule, EmailData } from "../../shared/types";

const containsIgnoreCase = (haystack: string, needle: string): boolean =>
  needle.length > 0 && haystack.toLowerCase().includes(needle.toLowerCase());

export function matchesRule(rule: AutoModeRule, email: EmailData, analysis: AnalysisResult): boolean {
  const hasCriteria =
    rule.senderPattern !== undefined ||
    rule.subjectPattern !== undefined ||
    rule.bodyPattern !== undefined ||
    rule.toPattern !== undefined ||
    rule.ccPattern !== undefined ||
    rule.hasAttachment !== undefined ||
    rule.minImportance !== undefined;
  if (!hasCriteria) return false; // rule rỗng → KHÔNG tự draft (BR-13 fail-closed)
  if (rule.senderPattern !== undefined && !containsIgnoreCase(email.sender.email, rule.senderPattern)) return false;
  if (rule.subjectPattern !== undefined && !containsIgnoreCase(email.subject, rule.subjectPattern)) return false;
  if (rule.bodyPattern !== undefined && !containsIgnoreCase(email.bodyText, rule.bodyPattern)) return false;
  if (rule.toPattern !== undefined && !recipientsContain(email.to, rule.toPattern)) return false;
  if (rule.ccPattern !== undefined && !recipientsContain(email.cc, rule.ccPattern)) return false;
  if (rule.hasAttachment === true && email.hasAttachment !== true) return false; // UAT — Outlook "with attachments"
  if (rule.minImportance !== undefined && analysis.importanceScore < rule.minImportance) return false;
  return true;
}

// UAT — so khớp người nhận: email HOẶC tên hiển thị chứa pattern (không phân biệt hoa thường).
function recipientsContain(recipients: { name: string; email: string }[], pattern: string): boolean {
  return containsIgnoreCase(recipients.map((r) => r.email + " " + r.name).join("; "), pattern);
}

export function matchesAnyRule(rules: AutoModeRule[], email: EmailData, analysis: AnalysisResult): boolean {
  return rules.some((rule) => matchesRule(rule, email, analysis));
}
