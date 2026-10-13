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
- Architecture Overview: 3 context (content script / service worker / options+popup), module boundaries theo cấu trúc thư mục PLAN.md mục 4; Shadow DOM isolation; message router pattern; MV3 constraints (service worker lifecycle, không persistent background)
- Component Design chi tiết: owa-adapter 3 tầng (selectors → semantic locator + locator-cache → vision-fallback opt-in), detector/reader/actions/triage; llm adapters 6 provider + registry (Factory pattern) + streaming qua chrome.runtime Port; storage typed wrapper; i18n
- Class/Module Design: TypeScript interfaces + responsibilities từng class, design patterns chỉ định rõ (Adapter cho LLM, Strategy cho selector tiers, Observer/MutationObserver cho auto-mode, Facade cho owa-adapter, Factory cho registry), соблюд file ≤200 dòng / function ≤20 dòng, cấu trúc models/components/services/utils
- API Design (internal): message protocol typed request/response giữa content ↔ service worker, Port streaming protocol (chunk/end/error events), storage schema + versioning/migration
- Data Design: schema đầy đủ các type FSD đã định nghĩa, cache design (locator cache theo layout hash, triage cache theo message-id, TTL + invalidation)
- Security Design section: API key storage (sync vs local), không log key, MV3 CSP, host permissions tối thiểu, xử lý email data PII, không remote code, auto-mode fail-closed
- Error Handling: strategy từng tầng, retry/backoff cho triage batch, timeout LLM, degraded mode khi locator fail hoàn toàn
- Implementation Checklist theo 6 GĐ (GĐ1 scaffold → GĐ2 LLM+options → GĐ3 analyze → GĐ4 reply+vision → GĐ5 triage → GĐ6 auto-mode), mỗi GĐ có danh sách file + deliverable + tiêu chí hoàn thành; ghi rõ dependency: GĐ2 phụ thuộc types của GĐ1 (shared/llm/types.ts, shared/types.ts)
- Testing Strategy: unit test (vitest) cho adapters/locator/cache, mocking chrome.* APIs, manual test checklist trên OWA thật
- DISCREPANCY: nếu phát hiện FSD có vấn đề kỹ thuật (mâu thuẫn, thiếu, không khả thi) → tạo documents/AIMH-LOCAL/DISCREPANCY.md liệt kê theo severity (Critical/High/Medium/Low); nếu không có vấn đề → KHÔNG tạo file này

## Draw.io diagrams (BẮT BUỘC, KHÔNG Mermaid) tại documents/AIMH-LOCAL/diagrams/
1. architecture.drawio + architecture.png — tổng thể 3 context + data flow
2. component.drawio + component.png — chi tiết component owa-adapter + llm + storage + messaging
3. class-diagram.drawio + class-diagram.png — class chính (LLMAdapter interface + 6 adapters + registry + OwaAdapter + các tầng locator + LocatorCache + MessageRouter)
Quy tắc XML: mxGraphModel root, không mxfile wrapper, edge không self-closing, màu semantic. Export PNG bằng drawio CLI, thất bại ghi THẬT vào section Diagrams cuối TDD.

## Ràng buộc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh
- KHÔNG Mermaid, KHÔNG Jira, KHÔNG DOCX
- Không viết code sản phẩm (chỉ interface/pseudocode minh họa trong TDD)

## Báo cáo khi xong
(1) đường dẫn file tạo; (2) có DISCREPANCY.md hay không + số mục theo severity; (3) trạng thái export PNG thật; (4) hạn chế nếu có.