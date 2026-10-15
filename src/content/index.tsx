// src/content/index.tsx — entry content script 3 domain OWA (TDD §2.1/§2.3/§4.1).
// GĐ3: Panel AI thật + inject nút "AI phân tích" vào toolbar email QUA owa-adapter (FR-GD3-04) —
// nút toolbar bắn event "aimh:analyze"; Panel lắng nghe và start analyze (không trực tiếp bấm DOM).
import { createRoot } from "react-dom/client";
import { initI18n } from "../shared/i18n";
import { Panel } from "./components/Panel/Panel";
import { adoptStyles, createShadowHost, PANEL_BASE_CSS } from "./components/shadow-root";
import { owaAdapter } from "./owa-adapter/owa-adapter";

const OWA_HOSTS = new Set(["outlook.office.com", "outlook.office365.com", "outlook.live.com", "outlook.cloud.microsoft"]);
const EXTERNAL_ANALYZE_EVENT = "aimh:analyze";

function isOwaHost(hostname: string): boolean {
  return OWA_HOSTS.has(hostname);
}

// §2.3 — mount React root trong shadow closed; mọi label qua i18n (FR-GD1-06).
function bootPanel(mount: { host: HTMLDivElement; shadow: ShadowRoot }): void {
  adoptStyles(mount.shadow, PANEL_BASE_CSS);
  createRoot(mount.shadow).render(<Panel host={mount.host} />);
}

// FR-GD3-04 — inject QUA adapter (biên DOM duy nhất); toolbar chưa thấy được (pre-spike OWA thật)
// → bỏ qua im lặng, nút trong panel vẫn dùng được (determination GĐ3: spike bắt buộc GĐ4).
function injectToolbar(): void {
  owaAdapter.injectAnalyzeButton(() => document.dispatchEvent(new Event(EXTERNAL_ANALYZE_EVENT)));
}

function main(): void {
  if (!isOwaHost(location.hostname)) return; // defense-in-depth ngoài manifest matches (§1.5)
  console.info("[AIMH] content script injected on " + location.hostname);
  bootPanel(createShadowHost());
  injectToolbar();
}

void initI18n().then(main);
