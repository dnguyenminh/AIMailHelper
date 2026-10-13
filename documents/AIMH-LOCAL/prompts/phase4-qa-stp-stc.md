NHIỆM VỤ: Tạo STP (Software Test Plan) + STC (Software Test Cases) cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Đầu vào (đọc trước)
1. documents/AIMH-LOCAL/BRD.md — 10 user stories + AC (nguồn RTM)
2. documents/AIMH-LOCAL/FSD.md v1.3 — 9 UC, BR-01..BR-17, 45 FR theo 6 GĐ, ERR-01..16, mục 10 Test Scenarios (14 TC), NFR mục 8
3. documents/AIMH-LOCAL/TDD.md — testing strategy (vitest + chrome mock + manual OWA checklist), §10 (cách đo NFR), §3/§5 (logic cần test)
4. documents/AIMH-LOCAL/GLOSSARY.md — thuật ngữ
5. Templates: documents/templates/STP-TEMPLATE.md + STC-TEMPLATE.md
6. Skills: .opencode/skills/phase-4-test-planning/SKILL.md + .opencode/skills/drawio-diagrams/SKILL.md

## Yêu cầu STP (documents/AIMH-LOCAL/STP.md)
- 6 test levels BẮT BUỘC: PBT (Property-Based), UT (Unit — vitest), IT (Integration — vitest với chrome mock thật hơn), E2E-API (LLM adapter contracts — mock HTTP server/thuần fetch assert), E2E-UI (manual trên OWA thật — Gherkin), SIT (System Integration — visual/UX trên OWA thật, maximize automation cho SIT)
- RTM (Requirements Traceability Matrix): 45 FR + 17 BR + 10 US → test cases, coverage 100%
- Test environment: Chrome + Edge, 2 domain OWA (outlook.office.com + outlook.live.com), local LLM preset (Ollama), mock provider cho automation
- Test data plan + chiến lược mock (LLM HTTP mock để không tốn token/chỉ test structure)
- Entry/exit criteria từng level, risk-based priority (an toàn BR-01 no-Send là priority cao nhất)

## Yêu cầu STC (documents/AIMH-LOCAL/STC.md)
- Test cases chi tiết theo ID TC-xx, mỗi case: preconditions, steps reproducible, test data cụ thể, expected results phản ánh đúng business rules (BR-xx references)
- PHỦ ĐỦ các nhóm: GĐ1 (manifest load unpacked, popup/options render, i18n vi/en fallback, storage typed wrapper validation BR-15), GĐ2 (6 adapter contracts: OpenAI/Azure/Anthropic 4 headers/Gemini x-goog-api-key/OpenAI-compatible/Local preset; streaming Port chunk/done/error; Test Connection latency; ModelPicker BR-17; keyStorage chuyển sync→local xóa key sync BR-04), GĐ3 (detector reading-pane/list/conversation; reader subject/sender/body; analyzer streaming → AnalysisResult parse; badge màu theo importanceScore; ERR flows: 401/429/timeout/stream đứt ERR-07), GĐ4 (tone/language selection; draft preview; chèn compose box KHÔNG bấm Send BR-01 — assert không có click vào Send; vision fallback opt-in BR-03), GĐ5 (triage cap 50; batch throttle/backoff; Digest sort theo score; cache message-id BR-07/BR-09; LRU 500), GĐ6 (auto-mode mặc định OFF BR-02; MutationObserver; hàng chờ duyệt Approve/Reject; QUEUE_MAX 200; fail-closed)
- Security-focused cases riêng (phục vụ P6.3): prompt injection từ email body → LLM output vẫn parse theo schema, fail-closed; XSS qua email content trong panel (React escape); key không xuất hiện trong log (redact BR-08)
- NFR verification cases (theo cách đo TDD §10): first token ~3s, triage 20 email < 60s, T2 cache hit < 10ms, selectors <1ms

## Draw.io diagrams (BẮT BUỘC, KHÔNG Mermaid) tại documents/AIMH-LOCAL/diagrams/
1. test-coverage.drawio + test-coverage.png — coverage matrix visualize: 6 levels × 6 GĐ × security
2. test-execution-flow.drawio + test-execution-flow.png — execution order: UT → IT → E2E-API → E2E-UI → SIT với entry/exit gates
Quy tắc: mxGraphModel root, không mxfile, edge không self-closing, escape & < trong label, màu semantic. Export PNG bằng draw.io CLI (C:\Program Files\draw.io\draw.io.exe -x -f png -b 10 --width 2000) + vision self-check đọc PNG (sửa tối đa 2 vòng). Thất bại ghi THẬT vào cuối STP section "Diagrams".

## Quy tắc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh; KHÔNG Mermaid; KHÔNG Jira; KHÔNG DOCX; KHÔNG sửa code/FSD/TDD
- STC có thể viết dạng bảng markdown compact nhưng đủ chi tiết reproducible

## Báo cáo khi xong
(1) đường dẫn files; (2) tổng số TC theo level + theo GĐ; (3) RTM coverage %; (4) trạng thái export PNG thật; (5) hạn chế nếu có.