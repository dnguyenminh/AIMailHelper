// src/popup/main.tsx — mount popup React app (GĐ1 shell — FSD §3.4 Màn 1).
import { createRoot } from "react-dom/client";
import { initI18n } from "../shared/i18n";
import { PopupApp } from "./PopupApp";
import "./popup.css";

const container = document.getElementById("root");
if (!container) throw new Error("popup: #root not found");

void initI18n().then(() => {
  createRoot(container).render(<PopupApp />);
});
