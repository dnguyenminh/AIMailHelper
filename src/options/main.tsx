// src/options/main.tsx — mount Options React app (GĐ1 shell — FSD §3.4 Màn 2).
// Migration chạy cả khi Options mở (TDD §3.3) — migrateIfNeeded idempotent (§6.3.1 #2).
import { createRoot } from "react-dom/client";
import { initI18n } from "../shared/i18n";
import { migrateIfNeeded } from "../shared/storage";
import { App } from "./App";
import "./options.css";

const container = document.getElementById("root");
if (!container) throw new Error("options: #root not found");

void (async () => {
  await migrateIfNeeded();
  await initI18n();
  createRoot(container).render(<App />);
})();
