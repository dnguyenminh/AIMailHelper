# 🔒 Security Design Review (P3.7) — AIMH-LOCAL

> Security review **mức THIẾT KẾ (design-level)** — KHÔNG review code (dự án greenfield: `src/` rỗng, chưa có `package.json` tại thời điểm 2026-10-14). Đối tượng review: TDD.md v1 (§3 owa-adapter, §6 API internal, §8 Security Design 10 mục), FSD.md v1.2 (mục 3.2 BR-01..BR-17, mục 5 API contracts 6 providers, mục 7 Security Requirements), PLAN.md (mục 5 LLM providers, mục 6 OWA adapter, mục 9 rủi ro). KHÔNG Jira, KHÔNG Mermaid, KHÔNG sửa TDD/FSD.

## Document Information

| Field | Value |
|-------|-------|
| Project | AIMailHelper — Trợ lý AI cho Outlook Web (Browser Extension MV3) |
| Ticket | AIMH-LOCAL (placeholder offline — KHÔNG có ticket Jira thật) |
| Scope | Design review 10 điểm: authN/authZ (API key), data protection (PII), API security (6 LLM providers), dependency/supply chain, infrastructure (manifest/service worker), injection (bao gồm prompt injection), session/storage sync scope, auto-mode fail-closed, No-Send guarantee, DOM manipulation |
| Method | Design review tĩnh theo cấu trúc documents/templates/SECURITY-REPORT-TEMPLATE.md — điều chỉnh cho domain browser extension: KHÔNG có HTTP server → thay "Security Headers Assessment" bằng "MV3 CSP & Manifest Security Assessment" (mục 6); KHÔNG có lockfile → thay "Dependency Vulnerabilities" bằng "Dependency Risk Register" (mục 5) |
| Date | 2026-10-14 |
| Assessor | Security Agent |
| Version | 1.0 |
| Verdict | **APPROVED WITH CONDITIONS** |

---

## Executive Summary

AIMailHelper là extension chạy hoàn toàn client-side: **không backend, không hệ thống tài khoản, không telemetry** — bề mặt tấn công nhỏ hơn đáng kể so với web application truyền thống. Nền tảng thiết kế bảo mật của TDD v1 **tốt và nhất quán**: (1) nguyên tắc fail-closed xuyên suốt — auto-mode TẮT mặc định (BR-02), vision TẮT (BR-03), rule rỗng → không draft (BR-13), QUEUE_MAX 200; (2) No-Send guarantee kiểm chứng 4 lớp với FunctionKey enum đóng, không tồn tại action trỏ tới nút Send (TDD §8.5, §3.1.1); (3) least-privilege manifest — 3 domain OWA + 4 LLM cloud khai báo tĩnh, provider tùy chỉnh xin optional permission per-origin kèm `permissions.contains()` kiểm tra trước fetch, thiếu → ERR-14 fail-loud (TDD §8.3); (4) một điểm kiểm soát duy nhất — mọi LLM call qua service worker, mọi storage access qua `storage.ts`, mọi thao tác DOM qua `owa-adapter` (TDD §1.4, §2.2).

Gap quan trọng nhất — trùng với ghi nhận của SM ở P3 gate ("TDD chưa nhắc prompt injection"): **nội dung email là input do kẻ tấn công kiểm soát** (mọi email đều có thể chứa instruction ẩn), nhưng thiết kế hiện tại đưa `bodyText` thẳng vào user message (FSD 5.2.0 `serializeEmailData`) mà chưa đặc tả lớp phòng vệ prompt injection nào. Thiệt hại bị chặn bởi 2 control có sẵn (BR-01 human-in-the-loop cho việc gửi; parse AnalysisResult fail-closed 6.6f) nhưng vẫn còn: kẻ tấn công có thể bóp méo AnalysisResult (score/summary/actions), manipulate triage badge/Digest, và — nguy hiểm nhất — **nhờ LLM soạn sẵn draft reply theo kịch bản phishing** mà người dùng có thể duyệt mà không đọc kỹ (đặc biệt khi "Approve all" của auto-mode). Ngoài ra review phát hiện **1 mâu thuẫn giữa pseudocode và claim bảo mật**: điều kiện filter trong FSD 6.6a (`INTERACTIVE_ROLES.has(role) || hasMeaningfulText(label)` — toán tử OR) cho phép label văn bản email (subject, sender, tối đa 80 ký tự đầu của đoạn body) lọt vào a11y snapshot — **trái với claim "snapshot KHÔNG chứa body email"** (FSD Open Issue #4, TDD §8.4) — và label này đi tiếp vào prompt LOCATOR_RESOLVE cũng như diagnose report (UC-09, đích nhận là bug report — khác với đích LLM đã consent). Cả 2 gap đều sửa được với effort thấp, không ảnh hưởng kiến trúc tổng thể.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 2 |
| 🔵 Low | 7 |
| ℹ️ Informational | 8 |

**Verdict: APPROVED WITH CONDITIONS** — thiết kế tổng thể được phê duyệt kèm **2 điều kiện bắt buộc** (SR-01 prompt injection, SR-02 data-minimization snapshot) phải chốt vào TDD trước khi DEV bắt đầu GĐ2/GĐ3, cộng **12 DEV-REQUIREMENT** phân bổ theo GĐ (mục 10). Không có finding nào đòi hỏi thay đổi kiến trúc (3 execution contexts, owa-adapter, LLM registry, storage schema giữ nguyên).

---

## 1. Phạm vi & Phương pháp

Phương pháp: design review tĩnh, đối chiếu từng yêu cầu review của P3.7 với đặc tả cụ thể trong TDD/FSD/PLAN (không nói chung chung — mỗi finding trỏ section); phân loại theo OWASP Top 10 (2021) + tham chiếu OWASP Top 10 for LLM Applications (LLM01 Prompt Injection); CVSS ước lượng ở mức thiết kế (không có code để verify exploitability thực tế — xem Appendix B).

Mapping 10 điểm review → findings:

| # | Điểm review (P3.7) | Findings | Kết luận chính |
|---|--------------------|----------|----------------|
| 1 | Authentication/Authorization (API key) | SR-03, SR-04, SR-05 | Thiết kế đúng hướng: key chỉ nằm trong header auth của adapter (TDD §8.1), CONFIG_GET chỉ trả `hasKey` (TDD §6.1), Gemini dùng header `x-goog-api-key` thay vì `?key=` (FSD 5.2.4). Gap: regex redact chỉ phủ pattern `sk-…`; disclosure "key đồng bộ qua Google" chưa rõ |
| 2 | Data protection (PII email → LLM) | SR-02, SR-18 | Consent model + BR-05 (chỉ endpoint user cấu hình, không backend) tốt; vision opt-in kép (BR-03) tốt; **mâu thuẫn pseudocode 6.6a ↔ claim data-minimization**; consent mang tính ngầm định |
| 3 | API security (6 LLM providers) | SR-06 | Error mapping qua `AppError` + i18nKey không chứa key; retry CHỈ pre-first-chunk, 413/4xx không retry → payload replay có giới hạn (FSD 5.2.0, TDD §9.2) — tốt; residual: BYO endpoint (baseUrl do user nhập) + header Anthropic direct-browser-access |
| 4 | Dependency/supply chain | SR-07, SR-12 | Không SDK LLM (fetch thuần — FR-GD2-10), bundle 100% local (BR-16) — đúng; chưa có lockfile, version range trong TDD §1.3, @crxjs/vite-plugin là dep rủi ro nhất |
| 5 | Infrastructure (manifest/SW) | SR-13, SR-16 | Least-privilege đạt (không `<all_urls>`, không `debugger`, không native messaging); quota caps đầy đủ (LRU 500, cap 50/lần quét, QUEUE_MAX 200, ERR-08 không mất key); heartbeat 20s chỉ khi có stream active + guardian idle 30s — không giữ SW sống vô hạn |
| 6 | Injection | SR-01, SR-08, SR-10, SR-17 | **Prompt injection = finding High duy nhất**; S2 regex KHÔNG ReDoS (verified); React escaping + Shadow DOM closed đạt; locator action integrity cần sanity check |
| 7 | Session/storage sync scope | SR-04, SR-05 | Không có session (N/A); key sync mặc định đi qua tài khoản Google/Chrome Sync — cần disclosure tường minh; local-only option có sẵn (BR-04) |
| 8 | Auto-mode fail-closed | SR-11, SR-15 | Fail-closed đạt (TDD §8.6: không code path bật tự động, confirm bắt buộc, không nhánh bỏ qua hàng chờ); gap: warning copy chưa nêu "email mới sẽ tự gửi tới LLM" |
| 9 | No-Send guarantee | SR-14 | 4 lớp kiểm chứng (design/code/test/review — TDD §8.5) + `send-button` chỉ để diagnose đối chiếu — **verified DESIGN-OK** |
| 10 | DOM manipulation | SR-10 | React auto-escape + Shadow DOM closed + `all: initial` (TDD §2.3, §8.2) đạt; cần loại exception `dangerouslySetInnerHTML` cho i18n + đặc tả badge inject bằng `createElement` |

---

## 2. Bảng Tổng hợp Findings

| ID | Severity | Category | Điểm thiết kế | Khuyến nghị | Trạng thái |
|----|----------|----------|---------------|-------------|------------|
| SR-01 | 🟠 High | A03 Injection / LLM01 Prompt Injection | FSD 5.2.0 đưa `bodyText` thẳng vào user message; TDD không có mitigation prompt injection nào (0 mentions — SM P3 gate note) | Bổ sung 3 lớp: anti-injection clause trong system prompt + fence serialization + validation fail-closed mở rộng; thêm TC prompt injection | **NEEDS-DESIGN-FIX** |
| SR-02 | 🟡 Medium | A04 Insecure Design / PII | Pseudocode FSD 6.6a dùng OR → label văn bản email (subject/sender/80 ký tự body) lọt vào a11y snapshot — mâu thuẫn claim "KHÔNG body email" (FSD Open Issue #4, TDD §8.4) | Chốt điều kiện AND; bỏ fallback "text rút gọn 80 ký tự" cho node không có aria-label; diagnose redact label; cập nhật privacy note | **NEEDS-DESIGN-FIX** |
| SR-03 | 🟡 Medium | A09 Logging Failures | TDD §8.1 regex redact `/sk-[A-Za-z0-9]{10,}/` chỉ phủ OpenAI-style — thiếu Gemini `AIza…`, Azure hex-32, key dạng khác của openai-compatible | Central `redactSecrets()` đa pattern + cấm serialize headers + unit test fixture key per provider (BR-08) | **DEV-REQUIREMENT** |
| SR-04 | 🔵 Low | A02 Cryptographic Failures | BR-04 default `sync` → API key đi qua Chrome Sync (hạ tầng Google), gắn với tài khoản user | Privacy note nói RÕ key được đồng bộ; nổi bật option local-only; ghi nhận residual risk | **DEV-REQUIREMENT** |
| SR-05 | ℹ️ Info | A02 | Key lưu plaintext trong chrome.storage — MV3 không cung cấp OS keystore | Document residual risk là chấp nhận (không có action code) | **DESIGN-OK** |
| SR-06 | 🔵 Low | A02/A05 | BYO endpoint (baseUrl user nhập) → key gửi tới host tùy ý; Anthropic header direct-browser-access | Enforce `https://` cho endpoint non-local; warning copy khi xin permission; note residual risk | **DEV-REQUIREMENT** |
| SR-07 | 🔵 Low | A06/A08 Supply chain | TDD §1.3 dùng version range (18.x/5.x/2.x); @crxjs/vite-plugin là plugin cộng đồng, chu kỳ bảo trì không đều; chưa có lockfile | Pin exact + commit lockfile + `npm audit`/`npm ci` + verify dist sau build | **DEV-REQUIREMENT** |
| SR-08 | 🔵 Low | A01/A03 | Output LLM (refId từ LOCATOR_RESOLVE, tọa độ % từ T3 vision) được tin tưởng khi thực hiện hành động DOM | Sanity check role/aria-label theo expectation map của FunctionKey sau khi deref / `elementFromPoint` | **DEV-REQUIREMENT** |
| SR-09 | 🔵 Low | A08 Integrity | TDD §7.5 S3 synthetic id dùng "djb2/sha1 ngắn" — hash 32-bit có xác suất collision → TriageScore gán nhầm email | Dùng SHA-256 qua `crypto.subtle.digest` cho synthetic id (và nhất quán cho layoutHash) | **DEV-REQUIREMENT** |
| SR-10 | 🔵 Low | A03 XSS | TDD §8.2 còn exception `dangerouslySetInnerHTML` cho chuỗi i18n; badge inject (TDD §3.1.6) chưa đặc tả API DOM an toàn | Cấm hoàn toàn innerHTML path (kể cả i18n); badge/reader dùng `createElement`/`textContent`; test grep | **DEV-REQUIREMENT** |
| SR-11 | 🔵 Low | A04 | `options.automation.autoModeWarning` (FSD 10.1) chưa nêu: khi auto-mode bật, nội dung email mới TỰ ĐỘNG gửi tới LLM provider | Bổ sung disclosure vào warning copy + privacy note | **DEV-REQUIREMENT** |
| SR-12 | ℹ️ Info | A05/A08 | CSP kế thừa mặc định MV3 (chưa khai báo tường minh); `web_accessible_resources` chưa đề cập trong TDD | Khai báo CSP tường minh trong manifest.config.ts; `web_accessible_resources` tối thiểu; verify production build không còn artifact dev/HMR | **DEV-REQUIREMENT** |
| SR-13 | ℹ️ Info | A05 | `optional_host_permissions: https://*/*` là mức declare rộng nhất | Verified DESIGN-OK — declare-only (không grant); request per-origin đúng §8.3/§8.10.8 | **DESIGN-OK** |
| SR-14 | ℹ️ Info | A01 Broken Access Control | No-Send guarantee 4 lớp (TDD §8.5) + FunctionKey enum đóng, không có key "send" + br01-audit.test.ts (§12.3) | Verified — giữ br01-audit test trong CI mọi GĐ | **DESIGN-OK** |
| SR-15 | ℹ️ Info | A01/A04 | Auto-mode fail-closed (TDD §8.6, BR-02/BR-13) + QUEUE_MAX 200 (TDD §7.4) | Verified — không tồn tại auto-approve path; Approve all là user-initiated | **DESIGN-OK** |
| SR-16 | ℹ️ Info | A04 | Storage quota caps: LRU 500 triage, locator chỉ giữ layoutHash hiện tại, cap 50/lần quét, ERR-08 giữ dữ liệu cũ không mất key (TDD §7.4, §6.3.2) | Verified — không có vector quota abuse | **DESIGN-OK** |
| SR-17 | ℹ️ Info | A03 | S2 regex `/(AAMk[A-Za-z0-9+/=]{20,})/` (TDD §7.5) — kiểm tra ReDoS | Verified KHÔNG ReDoS: char class đơn không lồng nhau, không alternation chồng → tuyến tính; input giới hạn trong attribute href của item | **DESIGN-OK** |
| SR-18 | ℹ️ Info | A04 | Consent model mang tính ngầm định (privacy note trong GeneralSettings — FR-GD2-08) | Khuyến nghị first-run consent banner trước lần analyze đầu (không chặn) | **DEV-REQUIREMENT** |

<!-- APPEND-1 -->
