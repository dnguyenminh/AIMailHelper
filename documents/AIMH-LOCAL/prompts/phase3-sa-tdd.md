NHIỆM VỤ: Tạo TDD v1 cho ticket **AIMH-LOCAL** (placeholder offline — KHÔNG gọi Jira, không bịa ticket key/URL). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Nguồn sự thật (đọc trước)
1. documents/AIMH-LOCAL/FSD.md — input chính
2. documents/AIMH-LOCAL/BRD.md — business context
3. documents/AIMH-LOCAL/GLOSSARY.md — thuật ngữ
4. documents/AIMH-LOCAL/REFERENCE-ANALYSIS.md — pattern self-healing đã nghiên cứu
5. PLAN.md — tech stack + cấu trúc thư mục mục 4 + LLM layer mục 5 + OWA adapter mục 6 (nguồn kỹ thuật chi tiết đã chốt)
6. documents/templates/TDD-TEMPLATE.md — theo cấu trúc
7. Kiểm tra src/ hiện có (nếu trống → TDD là thiết kế greenfield; ghi chú điều đó)

## Nhiệm vụ — Tạo documents/AIMH-LOCAL/TDD.md (v1), bắt buộc có:
- Architecture Overview: 3 context (content script / service worker / options+popup), module boundaries theo cấu trúc thư mục PLAN.md mục 4; Shadow DOM isolation; message router pattern; MV3 constraints (service worker lifecycle, không persistent background, heartbeat 20s chống idle — FSD 5.3.1)
- Component Design chi tiết: owa-adapter 3 tầng (selectors → semantic locator + locator-cache → vision-fallback opt-in), detector/reader/actions/triage; llm adapters 6 provider + registry (Factory pattern) + streaming qua chrome.runtime Port (protocol payload đầy đủ ở FSD 5.3.x); storage typed wrapper + migration (FSD 5.4.1); i18n
- Class/Module Design: TypeScript interfaces + responsibilities từng class, design patterns chỉ định rõ (Adapter cho LLM, Strategy cho selector tiers, Observer/MutationObserver cho auto-mode, Facade cho owa-adapter, Factory cho registry), соблюд file ≤200 dòng / function ≤20 dòng, cấu trúc models/components/services/utils
- SEQUENCE diagrams cho 3 flow chính: analyze email (đã có ở FSD — SA có thể tham chiếu/rà lại), reply draft (đã có), semantic locator fallback chain (T1 fail → cache → T2 LLM → ref resolve → cache write) — vẽ sequence mới nếu cần làm rõ logic TDD
- API Design (internal): message protocol typed request/response giữa content ↔ service worker, Port streaming protocol (chunk/end/error events — khớp FSD 5.3), storage schema + versioning/migration
- Data Design: KHÔNG được bỏ qua — FSD v1.2 đã có 11 entities được BA review (mục 4, BA-REVIEWED) + 4 TA Notes (PendingAutoDraft = QueueItem pending, refId cache chuyển structural selector khi ghi, normalize usage/finishReason, ChatOptions pointer). SA RESOLVE các quyết định còn chờ: Open Issues #3 (optional_host_permissions timing), #5 (message-id từ DOM — đề xuất strategy + fallback), #6 (confirm NFR targets), #7 (Pro mode interface stub), #10 (cap triage 50 + LRU 500 — confirm), #11 (ChatOptions defaults — chốt: maxTokens 2048, temperature 0.3 analyze/0.7 reply/0.2 triage). Mọi quyết định ghi rõ trong TDD + cập nhật trạng thái Open Issues trong FSD mục 12 nếu chốt
- Security Design section (chi tiết — security-agent sẽ review tiếp ở P3.7): API key storage (sync vs local, không log key), MV3 CSP không remote code, host permissions least-privilege (3 OWA + LLM domains + optional_host_permissions), xử lý PII email data (chỉ gửi tới endpoint user cấu hình — BR-05), no-Send guarantee (actions.ts không có code bấm Send — BR-01), auto-mode fail-closed (BR-02), vision fallback opt-in (BR-03), input validation (BR-15 enum chỉ nhận giá trị hợp lệ)
- Error Handling: strategy từng tầng, retry/backoff triage batch (ERR mapping FSD mục 9 + ERR-15/16), timeout LLM, degraded mode khi locator fail hoàn toàn (diagnose)
- Implementation Checklist theo 6 GĐ (GĐ1 scaffold → GĐ2 LLM+options → GĐ3 analyze → GĐ4 reply+vision → GĐ5 triage → GĐ6 auto-mode), mỗi GĐ có danh sách file + deliverable + tiêu chí hoàn thành; ghi rõ dependency: GĐ2 phụ thuộc types của GĐ1 (shared/llm/types.ts, shared/types.ts)
- Testing Strategy: unit test (vitest) cho adapters/locator/cache, mocking chrome.* APIs (chrome mock helper dùng chung), manual test checklist trên OWA thật (mốc sau GĐ4 trên cả outlook.office.com + outlook.live.com)
- DISCREPANCY: nếu phát hiện FSD có vấn đề kỹ thuật (mâu thuẫn, thiếu, không khả thi) → tạo documents/AIMH-LOCAL/DISCREPANCY.md liệt kê theo severity (Critical/High/Medium/Low); nếu không có vấn đề → KHÔNG tạo file này

## Draw.io diagrams (BẮT BUỘC, KHÔNG Mermaid) tại documents/AIMH-LOCAL/diagrams/
1. architecture.drawio + architecture.png — tổng thể 3 context + data flow (tên file KHÔNG trùng system-context của FSD)
2. component.drawio + component.png — chi tiết component owa-adapter + llm + storage + messaging
3. class-diagram.drawio + class-diagram.png — class chính (LLMAdapter interface + 6 adapters + registry + OwaAdapter + các tầng locator + LocatorCache + MessageRouter)
4. sequence-semantic-locator.drawio + .png — fallback chain T1 → cache → T2 (nếu thấy cần thiết cho logic)
Quy tắc XML: mxGraphModel root, không mxfile wrapper, edge không self-closing, KHÔNG có raw & hay < trong label (escape & <), màu semantic. Export PNG bằng draw.io CLI (C:\Program Files\draw.io\draw.io.exe -x -f png -b 10 --width 2000) — sau export PHẢI vision self-check bằng đọc PNG (check overlap/đè node, sửa tối đa 2 vòng). Thất bại ghi THẬT vào section Diagrams cuối TDD.

## Ràng buộc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh
- KHÔNG Mermaid, KHÔNG Jira, KHÔNG DOCX
- Không viết code sản phẩm (chỉ interface/pseudocode minh họa trong TDD)

## Báo cáo khi xong
(1) đường dẫn file tạo; (2) có DISCREPANCY.md hay không + số mục theo severity; (3) trạng thái export PNG thật; (4) hạn chế nếu có.