// src/content/modules/automode-rules.ts — rule engine thuần (TDD §3.7 GĐ6; FR-GD6-03; BR-13).
// Rule khớp khi MỌI field được định nghĩa đều khớp: senderPattern/subjectPattern so khớp
// KHÔNG phân biệt hoa thường (TC-119: "invoice" khớp "INVOICE #123"); minImportance:
// importanceScore >= ngưỡng (biên 69/70 — TC-119 #4). Fail-closed BR-13: rules rỗng HOẶC
// rule không định nghĩa field nào → KHÔNG khớp (chỉ analyze — caller vẫn phải gate trước).
import type { AnalysisResult, AutoModeRule, EmailData } from "../../shared/types";

const containsIgnoreCase = (haystack: string, needle: string): boolean =>
  needle.length > 0 && haystack.toLowerCase().includes(needle.toLowerCase());

export function matchesRule(rule: AutoModeRule, email: EmailData, analysis: AnalysisResult): boolean {
  const hasCriteria = rule.senderPattern !== undefined || rule.subjectPattern !== undefined || rule.minImportance !== undefined;
  if (!hasCriteria) return false; // rule rỗng → KHÔNG tự draft (BR-13 fail-closed)
  if (rule.senderPattern !== undefined && !containsIgnoreCase(email.sender.email, rule.senderPattern)) return false;
  if (rule.subjectPattern !== undefined && !containsIgnoreCase(email.subject, rule.subjectPattern)) return false;
  if (rule.minImportance !== undefined && analysis.importanceScore < rule.minImportance) return false;
  return true;
}

export function matchesAnyRule(rules: AutoModeRule[], email: EmailData, analysis: AnalysisResult): boolean {
  return rules.some((rule) => matchesRule(rule, email, analysis));
}
