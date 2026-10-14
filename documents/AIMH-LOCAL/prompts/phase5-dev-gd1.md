NHIỆM VỤ: Implement GĐ1 — Scaffold cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper. Git repo LOCAL (branch AIMH-LOCAL) — commit sau khi xong với message "AIMH-LOCAL: GĐ1 scaffold — Vite+CRXJS+React+TS, manifest, popup/options shell, storage, messaging, i18n, message router".

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/TDD.md **v1.1** — §2 Architecture (3 execution contexts, Shadow DOM, message router, MV3 lifecycle), §3.2/§3.3/§3.4/§3.5 (component design), §4.1 Package structure (chuẩn hóa cuối — DEV tạo đúng cây này), §4.2 Key interfaces (TypeScript chuẩn), §6.1 RPC message router (9 kinds), §11 checklist GĐ1
2. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — ĐỌC TRƯỚC; áp items GĐ1: SR-10 (cấm dangerouslySetInnerHTML/innerHTML — badge/reader dùng createElement/textContent), SR-12 (CSP tường minh trong manifest.config.ts: script-src 'self'; object-src 'self' + web_accessible_resources tối thiểu), SR-07 (pin exact versions KHÔNG ^/~, commit package-lock.json)
3. PLAN.md — mục 4 (cấu trúc thư mục), mục 7 GĐ1

## Deliverable GĐ1 (theo TDD §11 GĐ1 Done criteria):
1. **package.json** — pin EXACT versions (SR-07): react 18.x.x, react-dom, vite 5.x.x, @crxjs/vite-plugin 2.x.x, typescript 5.x.x, vitest + jsdom, @vitejs/plugin-react; scripts: dev/build/test (vitest run)/typecheck (tsc --noEmit)/lint
2. **manifest.config.ts** — MV3: name AIMailHelper, version 0.1.0, permissions: ["storage"] duy nhất; host_permissions: 3 domain OWA (outlook.office.com, outlook.office365.com, outlook.live.com) — KHÔNG thêm quyền thừa; optional_host_permissions: https://*/*, http://localhost/*, http://127.0.0.1/* (per TDD §8.3); content_security_policy tường minh (SR-12); background service_worker; action popup; options_page; content_scripts cho 3 OWA domains
3. **vite.config.ts** — CRXJS plugin + react plugin
4. **tsconfig.json** — strict mode toàn dự án
5. **src skeleton** theo TDD §4.1 (đúng cây package structure):
   - src/background/service-worker.ts — message router skeleton (9 RPC kinds từ TDD §6.1, switch/case typed, các handler stub trả ERR-xx hoặc "not implemented — GĐ2+"), KHÔNG logic LLM
   - src/shared/storage.ts — typed wrapper chrome.storage theo TDD §3.3 (validator BR-15, area routing BR-04, schema version)
   - src/shared/messaging.ts — typed request/response + Port streaming theo TDD §6.2 (types khớp §4.2)
   - src/shared/i18n/ — index.ts + vi.json + en.json (structure theo FSD i18n spec — đủ keys cho popup/options shell)
   - src/shared/llm/types.ts — ProviderId, LLMConfig (KHÔNG có keyStorage — DISC-1), ChatMessage, ChatOptions, LLMResponse — interface CHỈ THÔI (GĐ2 mới implement adapters)
   - src/shared/types.ts — EmailData, AnalysisResult, ReplyDraft, TriageScore, LocatorCacheEntry, QueueItem... (theo TDD §7.2 chuẩn hóa — KHÔNG cài logic)
   - src/popup/ — React popup shell (provider active + bật/tắt + link mở Options — theo FSD UI spec) + PopupApp.tsx
   - src/options/ — React options shell với 6 section placeholder (ProviderForm, ModelPicker, TestConnection, PromptSettings, AutomationSettings, GeneralSettings — form DISABLED/stub, GĐ2 mới điền) + App.tsx
   - src/content/index.tsx — entry stub (log inject, Shadow DOM root skeleton theo TDD §2.3)
6. **Vitest setup** — vitest.config.ts + 1 test mẫu chạy được (smoke test storage validator với chrome mock stub) + chrome mock helper (test/mocks/chrome.ts)
7. **eslint config** (nếu nhanh) — optional, không chặn

## Ràng buộc kỹ thuật
- File ≤200 dòng, function ≤20 dòng, SOLID + design patterns (Router pattern cho service worker, Facade storage)
- KHÔNG implement GĐ2 (adapters chỉ để types/interface, KHÔNG fetch logic); KHÔNG GĐ3+ 
- KHÔNG API key hard-code; KHÔNG remote code; KHÔNG eval
- i18n: fallback English khi thiếu key (FR-GD1-06, FR-GD2-09)
- CHẠY: npm install (tạo package-lock.json — commit luôn), npm run build (đảm bảo build thành công ra dist/), npm test (smoke test pass), tsc --noEmit pass — BÁO KẾT QUẢ THẬT từng lệnh
- Nếu npm install lỗi network/registry → báo cáo thật, KHÔNG fake

## Báo cáo khi xong
(1) cây file tạo (đường dẫn + số dòng từng file); (2) kết quả thật: npm install / build / test / typecheck (pass/fail + nguyên nhân nếu fail); (3) xác nhận SR-10/12/07 items đã áp; (4) commit hash; (5) hạn chế.