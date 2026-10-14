// src/content/owa-adapter/owa-adapter.ts — «facade» API DUY NHẤT tới DOM OWA (TDD §3.1, §4.2).
// Biên DOM duy nhất (§1.4 #2): modules/components chỉ thấy facade; chuỗi locate theo §5.3
// (SemanticLocator orchestrate T1→cache→T2; T3 vision cắm thêm GĐ4 qua LocatorStrategy).
// FunctionKey/LocatorStrategy/SelectorTier canonical ở selectors.ts — re-export giữ API GĐ1.
import { notImplementedError } from "../../shared/errors";
import type { EmailData } from "../../shared/types";
import { detectView } from "./detector";
import type { OwaViewInfo } from "./detector";
import { readEmail } from "./reader";
import { resolveBySelectors, SelectorTier } from "./selectors";
import type { FunctionKey, LocatorStrategy } from "./selectors";
import { SemanticLocator } from "./semantic-locator";

export type { FunctionKey, LocatorStrategy } from "./selectors";
export { SelectorTier };

export class OwaAdapter {
  private readonly chain: LocatorStrategy;

  // Mặc định: SemanticLocator (chuỗi T1→cache→T2 — §5.3); test inject tiers thay thế.
  constructor(tiers: readonly LocatorStrategy[] = []) {
    this.chain = tiers[0] ?? new SemanticLocator();
  }

  // §5.3 — chuỗi locator đầy đủ; fail hoàn toàn → null (caller quyết ERR-06 + Diagnose, §9.3).
  async locate(functionKey: FunctionKey, question = ""): Promise<Element | null> {
    return this.chain.resolve(functionKey, question);
  }

  // §3.1.4 — detector: structural probe reading-pane/popout/conversation/unknown (FR-GD3-01).
  detectView(): OwaViewInfo {
    return detectView();
  }

  // §3.1.4 — reader: EmailData qua locate; gate BR-14 nằm trong reader (GĐ3 Done #2).
  async readEmail(): Promise<EmailData> {
    return readEmail((key, question) => this.locate(key, question), this.detectView());
  }

  // FR-GD3-04 — inject nút "AI phân tích" vào toolbar email QUA adapter (components không tự bấm DOM).
  injectAnalyzeButton(onClick: () => void): HTMLElement | null {
    return injectToolbarButton(onClick);
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

const BUTTON_ID = "aimh-analyze-button";

// SR-10 — createElement/textContent, không innerHTML; guard duplicate (toolbar re-render OWA).
function injectToolbarButton(onClick: () => void): HTMLElement | null {
  const toolbar = resolveBySelectors("message-toolbar");
  if (!toolbar || document.getElementById(BUTTON_ID)) return null;
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "AI phân tích");
  button.textContent = "AI phân tích";
  button.style.cssText =
    "margin-left:8px;padding:2px 10px;border-radius:4px;border:1px solid #0f6cbd;background:#0f6cbd;color:#fff;font:inherit;cursor:pointer;";
  button.addEventListener("click", onClick);
  toolbar.appendChild(button);
  return button;
}

export const owaAdapter = new OwaAdapter(); // instance dùng chung content script
