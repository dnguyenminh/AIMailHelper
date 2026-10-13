NHIỆM VỤ: Tạo BRD v1 cho ticket **AIMH-LOCAL** (placeholder offline — Jira MCP KHÔNG khả dụng, TUYỆT ĐỐI KHÔNG gọi công cụ Jira nào, không bịa ticket key/URL). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper (bạn đang ở đây).

## Nguồn sự thật
1. Đọc file PLAN.md ở root workspace — kế hoạch ĐÃ CHỐT với user (scoping, tech stack, 6 giai đoạn GĐ1-6, rủi ro). BRD phải bám 100% vào PLAN.md, KHÔNG bịa thêm yêu cầu ngoài scope.
2. Template: documents/templates/BRD-TEMPLATE.md — theo cấu trúc template này.
3. Đọc skill .opencode/skills/phase-1-requirements/SKILL.md và .opencode/skills/drawio-diagrams/SKILL.md để nắm workflow + quy tắc vẽ diagram.

## Các bước (thứ tự bắt buộc)

### Bước A — REFERENCE-ANALYSIS (trước khi viết BRD)
Tạo documents/AIMH-LOCAL/REFERENCE-ANALYSIS.md từ mục 10 của PLAN.md (bảng nguồn nghiên cứu self-healing 2026-10: Claude in Chrome, Stagehand v4, browser-use, Skyvern, Playwright MCP). Mỗi reference có: Architecture / Key patterns / Strengths; kết thúc bằng section "Patterns to adopt in our BRD/TDD" dạng checklist. KHÔNG cần web search — PLAN.md mục 10 đã tổng hợp đủ. KB/mem tools KHÔNG có trong session này — bỏ qua mọi mem_ingest/mem_search.

### Bước B — Viết BRD
Tạo documents/AIMH-LOCAL/BRD.md (v1) theo template, bắt buộc có:
- Executive summary; mục tiêu / phi mục tiêu (scope đã chốt: Chrome+Edge MV3, đọc DOM OWA KHÔNG dùng Graph API, 6 LLM providers, React 18 + Vite + @crxjs/vite-plugin, i18n vi/en, full 6 giai đoạn)
- Stakeholders & personas (user doanh nghiệp OWA work/school trên outlook.office.com + outlook.office365.com, và cá nhân outlook.live.com)
- Ít nhất 8 User Stories có Acceptance Criteria, phủ đủ 6 GĐ: phân tích email (GĐ3), soạn trả lời draft (GĐ4), triage inbox + Digest (GĐ5), auto-mode mặc định TẮT với hàng chờ duyệt (GĐ6), cấu hình LLM multi-provider + Test Connection (GĐ2), chọn nơi lưu API key sync/local (GĐ2), chuyển ngôn ngữ UI vi/en (GĐ1-2), privacy & an toàn (không tự bấm Send)
- Business flow: phân tích → draft → user duyệt/sửa → user tự bấm Send; nhánh triage → Digest; nhánh auto-mode (OFF mặc định) → hàng chờ duyệt
- Dependencies: DOM OWA, LLM endpoints, OLLAMA_ORIGINS cho local, header CORS Anthropic (anthropic-dangerous-direct-browser-access)
- Non-Functional Requirements: privacy (email data chỉ gửi tới LLM endpoint user tự cấu hình), an toàn (KHÔNG tự bấm Send, auto-mode mặc định TẮT, vision fallback mặc định TẮT), hiệu năng (selectors tầng 1 <1ms, cache theo layout hash, batch throttle triage), bảo mật (API key trong chrome.storage, MV3 CSP không remote code), khả năng thích ứng khi MS đổi UI (self-healing 3 tầng)
- Rủi ro & giảm thiểu (bảng mục 9 PLAN.md)
- Section "Phạm vi theo giai đoạn": 6 GĐ kèm deliverable từng GĐ (mục 7 PLAN.md)

### Bước C — Draw.io diagrams (BẮT BUỘC, KHÔNG dùng Mermaid)
Tạo tại documents/AIMH-LOCAL/diagrams/:
1. business-flow.drawio + business-flow.png — luồng nghiệp vụ chính
2. use-case.drawio + use-case.png — actors: Email User, LLM Provider (external), Power User (cấu hình); use cases: Analyze Email, Draft Reply, Triage Inbox, Configure LLM Provider, Approve/Reject Auto-drafts, Switch UI Language
Quy tắc XML: file bắt đầu bằng mxGraphModel (KHÔNG bọc mxfile), edge KHÔNG self-closing (phải có mxGeometry con đóng đầy đủ), màu semantic (xanh start/end, vàng process, cam decision, đỏ cảnh báo an toàn). Export PNG bằng drawio CLI (thử: drawio -x -f png, hoặc npx -y @excalidraw/... KHÔNG — chỉ drawio CLI chính chủ, hoặc tìm script export trong skill). Nếu mọi cách export thất bại thì ghi THẬT vào section "Diagrams" cuối BRD.md: file .drawio đã tạo, PNG export thất bại với lý do. KHÔNG bịa kết quả export.

### Bước D — GLOSSARY (file-based, thay KB)
Tạo documents/AIMH-LOCAL/GLOSSARY.md — tối thiểu 8 thuật ngữ domain: OWA Adapter, Self-healing Locator, A11y Tree, Ref ID, LLM Provider/Adapter, Draft (phân biệt Send), Triage/Digest, Auto-mode, Analysis Result, Layout Hash. Mỗi entry: term | definition | avoid (từ đồng nghĩa cần tránh).

## Ràng buộc
- Ngôn ngữ: tiếng Việt (thuật ngữ kỹ thuật giữ tiếng Anh)
- KHÔNG dùng Mermaid ở bất kỳ đâu
- KHÔNG gọi Jira; KHÔNG tạo DOCX (tool không có)
- KHÔNG viết code sản phẩm — chỉ BRD + REFERENCE-ANALYSIS + GLOSSARY + diagrams

## Báo cáo khi xong (bắt buộc)
Liệt kê: (1) đường dẫn tuyệt đối mọi file đã tạo; (2) số user stories; (3) danh sách diagrams kèm trạng thái export PNG THẬT (thành công/thất bại + lý do); (4) hạn chế gặp phải nếu có.