// src/shared/i18n/index.ts — i18n tự viết: dict phẳng screen.group.key, placeholder {name} (TDD §3.5; FSD §10).
// Fallback: thiếu key vi → en → vẫn thiếu → raw key + console.warn (ERR-13, UI không vỡ — FR-GD1-06).
import enDict from "./en.json";
import viDict from "./vi.json";
import { DEFAULT_GENERAL } from "../storage-schema";
import { storage } from "../storage";
import type { UiLanguage } from "../types";

type Dictionary = Record<string, string>;
const DICTS: Record<UiLanguage, Dictionary> = { vi: viDict as Dictionary, en: enDict as Dictionary };

let current: UiLanguage = DEFAULT_GENERAL.uiLanguage;
const listeners = new Set<(lang: UiLanguage) => void>();

export function t(key: string, params?: Record<string, string | number>): string {
  const template = DICTS[current][key] ?? DICTS.en[key];
  if (template === undefined) {
    console.warn("[AIMH][i18n] missing key: " + key); // ERR-13 — fallback en đã miss → raw key
    return key;
  }
  return renderTemplate(template, params);
}

// FSD §10.2 #4: placeholder không khớp khi render → render chuỗi gốc + log cảnh báo.
function renderTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let matched = false;
  const rendered = template.replace(/\{(\w+)\}/g, (original: string, name: string): string => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      matched = true;
      return String(params[name]);
    }
    return original;
  });
  if (!matched) {
    console.warn("[AIMH][i18n] no placeholder matched for: " + template);
    return template;
  }
  return rendered;
}

export function getUiLanguage(): UiLanguage {
  return current;
}

// Observer pattern (§4.3): pub/sub onLanguageChange — đổi ngôn ngữ → popup/panel/Options re-render (UC-08).
export function onLanguageChange(listener: (lang: UiLanguage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const subscribeLanguage = onLanguageChange;

export async function initI18n(): Promise<void> {
  try {
    current = (await storage.getGeneral()).uiLanguage;
  } catch {
    current = DEFAULT_GENERAL.uiLanguage; // storage hỏng → fallback vi, UI không vỡ
  }
}

// BR-15: validate enum nằm ở storage.setGeneral — giá trị sai bị từ chối, không âm thầm sửa.
export async function setUiLanguage(lang: UiLanguage): Promise<void> {
  const general = await storage.getGeneral();
  if (general.uiLanguage !== lang) await storage.setGeneral({ ...general, uiLanguage: lang });
  if (current === lang) return;
  current = lang;
  for (const listener of [...listeners]) listener(lang);
}

export const I18N_DICTIONARY_SIZE = 110; // keyset vi === en (assert trong test GĐ2)
