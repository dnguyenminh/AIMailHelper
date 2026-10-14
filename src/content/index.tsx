// src/content/index.tsx — entry content script 3 domain OWA (TDD §2.1/§2.3/§4.1).
// GĐ1 stub: log inject + Shadow DOM root skeleton; listeners/panel thật ở GĐ3+.
import { createRoot } from "react-dom/client";
import { initI18n } from "../shared/i18n";
import { Panel } from "./components/Panel/Panel";
import { adoptStyles, createShadowHost, PANEL_BASE_CSS } from "./components/shadow-root";

const OWA_HOSTS = new Set(["outlook.office.com", "outlook.office365.com", "outlook.live.com"]);

function isOwaHost(hostname: string): boolean {
  return OWA_HOSTS.has(hostname);
}

// §2.3 — mount React root trong shadow closed; mọi label qua i18n (FR-GD1-06).
function bootPanel(): void {
  const mount = createShadowHost();
  adoptStyles(mount.shadow, PANEL_BASE_CSS);
  createRoot(mount.shadow).render(<Panel />);
}

function main(): void {
  if (!isOwaHost(location.hostname)) return; // defense-in-depth ngoài manifest matches (§1.5)
  console.info("[AIMH] content script injected on " + location.hostname);
  bootPanel();
}

void initI18n().then(main);
