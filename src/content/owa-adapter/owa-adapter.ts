// src/content/owa-adapter/owa-adapter.ts — «facade» API DUY NHẤT tới DOM OWA (TDD §3.1, §4.2).
// Biên DOM duy nhất (§1.4 #2): modules/components chỉ thấy facade; T2/T3 cắm qua LocatorStrategy (§4.3).
// GĐ1: T1 SelectorTier hoàn thiện; cache/T2/T3/detector/reader/actions/triage là stub GĐ3+.
import { notImplementedError } from "../../shared/errors";
import type { EmailData } from "../../shared/types";
import { resolveBySelectors } from "./selectors";

export type FunctionKey =
  | "reading-pane"
  | "message-toolbar"
  | "reply-button"
  | "compose-box"
  | "inbox-list"
  | "inbox-item";

// «interface» Strategy (§4.3): SelectorTier (T1) · SemanticLocator (T2, GĐ3) · VisionFallback (T3, GĐ4).
export interface LocatorStrategy {
  resolve(functionKey: FunctionKey, question: string): Promise<Element | null>;
}

// T1 fast-path — <1ms, 0 token (NFR §10). GĐ1 Done (3): chain trả element trên 3 domain (spike GĐ3).
export class SelectorTier implements LocatorStrategy {
  async resolve(functionKey: FunctionKey, _question: string): Promise<Element | null> {
    return resolveBySelectors(functionKey);
  }
}

export class OwaAdapter {
  private readonly t1: LocatorStrategy;

  constructor(tiers: readonly LocatorStrategy[] = []) {
    this.t1 = tiers[0] ?? new SelectorTier();
  }

  // §5.3 — GĐ1: chỉ T1. Cache (BR-06) → T2 (LOCATOR_RESOLVE) → T3 (opt-in) nối chuỗi ở GĐ3.
  async locate(functionKey: FunctionKey, question = ""): Promise<Element | null> {
    return this.t1.resolve(functionKey, question);
  }

  // §3.1.4 — detector: nhận diện reading-pane/popout/conversation bằng structural probe (GĐ3).
  detectView(): never {
    throw notImplementedError("GĐ3");
  }

  async readEmail(): Promise<EmailData> {
    throw notImplementedError("GĐ3"); // BR-14 gate bodyText rỗng nằm ở reader (GĐ3)
  }

  async insertDraft(_draft: string): Promise<void> {
    throw notImplementedError("GĐ4"); // BR-01: không có API nào bấm nút Send
  }

  collectInboxItems(): never {
    throw notImplementedError("GĐ5"); // §3.1.6 triage (BR-07)
  }

  attachBadge(_messageId: string, _score: number): never {
    throw notImplementedError("GĐ5");
  }
}

export const owaAdapter = new OwaAdapter(); // instance dùng chung content script
