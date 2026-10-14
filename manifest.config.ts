// manifest.config.ts — MV3 manifest (CRXJS) — TDD §1.3/§8.2/§8.3; DEV-SECURITY-CHECKLIST SR-12.
// SR-07: KHÔNG thêm quyền thừa — permissions chỉ "storage"; host_permissions chỉ 3 domain OWA (GĐ1).
// LLM cloud host_permissions + optional localhost sẽ bổ sung ở GĐ2 (TDD §8.3, §11 GĐ2).
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "AIMailHelper",
  description: "Trợ lý AI cho Outlook Web — phân tích email, draft reply (không tự gửi), triage hộp thư.",
  version: "0.1.0",
  // BR-15/BR-04: chrome.storage sync + local — quyền duy nhất của extension (SR-12 least privilege).
  permissions: ["storage"],
  // BR-05: chỉ 3 domain OWA + 4 LLM cloud (endpoint cố định — §8.3, GĐ2) — content script chỉ inject 3 domain OWA.
  host_permissions: [
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
    "https://outlook.live.com/*",
    "https://api.openai.com/*",
    "https://*.openai.azure.com/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  // SR-13 (DESIGN-OK): declare-only — xin per-origin lúc lưu cấu hình provider (§8.3, GĐ2).
  optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  action: { default_popup: "src/popup/index.html" },
  options_page: "src/options/index.html",
  content_scripts: [
    {
      matches: [
        "https://outlook.office.com/*",
        "https://outlook.office365.com/*",
        "https://outlook.live.com/*"
      ],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ],
  // SR-12: CSP tường minh — không remote code (BR-16); script-src/object-src 'self'.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
  // SR-12: web_accessible_resources TỐI THIỂU — GĐ1 không asset nào cần expose → không khai báo.
});
