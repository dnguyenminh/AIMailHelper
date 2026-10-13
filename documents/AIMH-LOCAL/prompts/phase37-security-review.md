NHIỆM VỤ: Security Design Review (Phase 3.7) cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Đầu vào (đọc trước khi review)
1. documents/AIMH-LOCAL/TDD.md — thiết kế chính, đặc biệt §8 Security Design (10 mục) + §3 owa-adapter + §6 API internal
2. documents/AIMH-LOCAL/FSD.md — mục 3.2 Business Rules BR-01..BR-17, mục 5 API contracts 6 providers, mục 7 Security Requirements
3. PLAN.md — mục 5 (LLM providers), mục 6 (OWA adapter), mục 9 (rủi ro)
4. documents/templates/SECURITY-REPORT-TEMPLATE.md — theo cấu trúc template này

## Nhiệm vụ: Tạo documents/AIMH-LOCAL/SECURITY-REVIEW.md — review THIẾT KẾ (design-level) các điểm:
1. Authentication/Authorization: extension không có auth server; API key user-provided — review cách key được lưu (chrome.storage sync/local), truyền (chỉ qua fetch trực tiếp tới provider), redact trong log (TDD §8.1)
2. Data protection: email PII gửi tới LLM endpoint (BR-05) — review consent model, data minimization (a11y snapshot không chứa body — DISC-3, max_chars 20K), vision opt-in (BR-03), diagnose report redact (UC-09 EF-3)
3. API security: 6 LLM provider endpoints — review error mapping không leak key, timeout/retry không replay payload quá giới hạn, CORS headers Anthropic (anthropic-dangerous-direct-browser-access), optional_host_permissions flow (TDD §8.3)
4. Dependency risks: MV3 CSP không remote code (BR-16, TDD §8.2), không SDK nặng (fetch thuần), bundle local — đánh giá supply chain (npm deps: React, Vite, CRXJS — version pinning, audit)
5. Infrastructure security: không backend server — review manifest permissions least-privilege (3 OWA domains + LLM domains + optional), no debug/service worker risks (heartbeat 20s), storage quota abuse
6. Injection risks: email content → LLM prompt injection (người gửi email độc hại nhét instruction trong body → LLM bị manipulate!) — review mitigation: system prompt cố định, output schema validation (parse AnalysisResult fail-closed), không eval/html injection khi render panel (React escaping + Shadow DOM), message-id href regex (S2) có ReDoS risk không
7. Session management: không session — review storage sync scope (key đi qua tài khoản Google sync — có đúng kỳ vọng user không? BR-04 default sync nhưng local-only option)
8. Auto-mode fail-closed (BR-02/BR-13, TDD §8.6): review hàng chờ duyệt — không auto-approve path, QUEUE_MAX 200
9. No-Send guarantee (BR-01, TDD §8.5): review 4 lớp kiểm chứng — actions.ts không gọi nút Send, không click bất kỳ button ngoài compose fill
10. DOM manipulation risks: content script đọc DOM OWA — review XSS qua email content khi render vào panel (React auto-escape, không dangerouslySetInnerHTML), Shadow DOM isolation

## Output: documents/AIMH-LOCAL/SECURITY-REVIEW.md
- Bảng findings: ID | Severity (Critical/High/Medium/Low/Info) | Category | Điểm thiết kế | Khuyến nghị | Trạng thái (DESIGN-OK / NEEDS-DESIGN-FIX / DEV-REQUIREMENT)
- Executive summary + verdict: APPROVED / APPROVED WITH CONDITIONS / CHANGES REQUIRED
- Mỗi finding phải tham chiếu section cụ thể TDD/FSD (không nói chung chung)

## Quy tắc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX; KHÔNG sửa TDD/FSD (chỉ review + tạo SECURITY-REVIEW.md)

## Báo cáo khi xong
(1) số findings theo severity; (2) verdict; (3) các DEV-REQUIREMENT cần dev-agent thực hiện (nếu có).