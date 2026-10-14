// src/content/modules/automode-rules.test.ts — rule engine thuần (TC-119; FR-GD6-03; BR-13).
// (1) rules rỗng + rule rỗng → KHÔNG khớp (BR-13 fail-closed) (2) senderPattern (3)
// subjectPattern case-insensitive (4) minImportance biên 69/70 (5) rule nhiều field: AND.
import { describe, expect, it } from "vitest";
import { matchesAnyRule, matchesRule } from "./automode-rules";
import type { AnalysisResult, AutoModeRule, EmailData } from "../../shared/types";
import { EMAIL, analysisOf } from "./automode-testkit";

const match = (rule: AutoModeRule, email: EmailData = EMAIL, analysis: AnalysisResult = analysisOf(80)): boolean =>
  matchesRule(rule, email, analysis);

describe("AutoModeRule engine (TC-119 — FR-GD6-03, BR-13)", () => {
  it("TC-119 #1: rules rỗng → matchesAnyRule false; rule không field nào → false (BR-13 fail-closed)", () => {
    expect(matchesAnyRule([], EMAIL, analysisOf(80))).toBe(false);
    expect(match({})).toBe(false); // rule rỗng → KHÔNG draft gì cả
  });

  it("TC-119 #2: senderPattern 'boss@x.com' → khớp email boss, không khớp người khác", () => {
    expect(match({ senderPattern: "boss@x.com" })).toBe(true);
    expect(match({ senderPattern: "other@x.com" })).toBe(false);
  });

  it("TC-119 #3: subjectPattern 'invoice' khớp 'INVOICE #123' (case-insensitive)", () => {
    expect(match({ subjectPattern: "invoice" })).toBe(true);
    expect(match({ subjectPattern: "INVOICE" })).toBe(true);
    expect(match({ subjectPattern: "payment" })).toBe(false);
  });

  it("TC-119 #4: minImportance=70 — score 69 KHÔNG khớp, score 70 khớp (biên)", () => {
    expect(match({ minImportance: 70 }, EMAIL, analysisOf(69))).toBe(false);
    expect(match({ minImportance: 70 }, EMAIL, analysisOf(70))).toBe(true);
  });

  it("rule nhiều field: mọi field ĐỊNH NGHĨA đều phải khớp (AND)", () => {
    const analysis = analysisOf(69);
    expect(match({ senderPattern: "boss@x.com", subjectPattern: "invoice", minImportance: 70 }, EMAIL, analysis)).toBe(false);
    expect(match({ senderPattern: "boss@x.com", subjectPattern: "invoice", minImportance: 60 }, EMAIL, analysis)).toBe(true);
  });
});
