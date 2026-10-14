// src/shared/i18n/react.ts — hook React cho i18n reactive (TDD §4.1 bổ sung — §3.5 pub/sub).
import { useSyncExternalStore } from "react";
import { getUiLanguage, subscribeLanguage } from "./index";
import type { UiLanguage } from "../types";

export function useUiLanguage(): UiLanguage {
  return useSyncExternalStore(subscribeLanguage, getUiLanguage, getUiLanguage);
}
