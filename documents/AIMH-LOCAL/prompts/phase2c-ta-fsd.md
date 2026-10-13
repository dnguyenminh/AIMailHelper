NHIỆM VỤ: Review + enrich FSD cho ticket **AIMH-LOCAL** (placeholder offline — KHÔNG gọi Jira). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Nguồn đọc
1. documents/AIMH-LOCAL/FSD.md — FSD draft (BA đã viết business sections) — ĐỐI TƯỢNG CHỈNH SỬA
2. documents/AIMH-LOCAL/BRD.md + PLAN.md (mục 3-6: tech stack, cấu trúc thư mục, LLM layer, OWA adapter 3 tầng)
3. documents/AIMH-LOCAL/GLOSSARY.md — dùng đúng thuật ngữ
4. documents/AIMH-LOCAL/REFERENCE-ANALYSIS.md — pattern self-healing

## Nhiệm vụ — KHÔNG viết lại FSD, CHỈ review + enrich tại chỗ (edit file):
1. Review Use Cases — bổ sung Alternative/Exception flows nếu thiếu
2. API Contracts chi tiết hóa cho DEV implement được: với MỖI LLM provider (OpenAI, Azure OpenAI, Anthropic, Gemini, OpenAI-compatible, Local Ollama/LM Studio) định nghĩa: endpoint chính xác, headers (bao gồm anthropic-dangerous-direct-browser-access cho Anthropic), request body schema, response schema, streaming format (SSE chunk format từng provider), listModels endpoint (nếu có), error mapping (401/403/429/timeout/overloaded → message + retry policy)
3. Integration Requirements: chrome.runtime Port streaming protocol (message types: request/chunk/done/error — định nghĩa payload từng loại), chrome.storage schema + versioning/migration strategy, message router protocol content ↔ service worker (typed request/response)
4. Pseudocode cho logic phức tạp: a11y-tree walker (sinh ref ID + WeakRef map), semantic locator flow (tầng 1 fail → build tree → LLM → resolve ref → cache), locator cache invalidation theo layout hash, triage batch analyze (throttle + backoff), streaming chunk handler
5. Review Data Model — đảm bảo khớp các type: EmailData, AnalysisResult, ReplyDraft, TriageScore, LLMConfig, ChatMessage, LLMResponse, ProviderId, LocatorCacheEntry, PendingAutoDraft
6. NFR có chỉ số định lượng nếu thiếu
7. Open Issues — liệt kê quyết định kỹ thuật chưa chốt (nếu có)

## Ràng buộc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh
- KHÔNG Mermaid; KHÔNG sửa diagrams (đã có 4 diagrams FSD; nếu bổ sung pseudocode/thuật toán thì mô tả text trong FSD)
- KHÔNG Jira, KHÔNG DOCX, KHÔNG viết code sản phẩm
- File ≤ 200 dòng quy tắc KHÔNG áp dụng cho tài liệu markdown

## Báo cáo khi xong
(1) tổng quan những gì đã enrich (số section sửa/bổ sung); (2) số API contract hoàn chỉnh cho 6 providers; (3) Open Issues còn lại; (4) danh sách diagrams đã tham chiếu trong FSD (chỉ đọc, không tạo mới).

## BỔ SUNG (cập nhật mới nhất)
- mem_search KB đang trả rỗng dù ingest thành công (indexing lag) → KHÔNG phụ thuộc KB, đọc trực tiếp files documents/AIMH-LOCAL/ (FSD.md, BRD.md, GLOSSARY.md, REFERENCE-ANALYSIS.md) làm nguồn chính.
- KHÔNG tạo diagram mới; KHÔNG sửa diagrams hiện có (4 diagrams đã vision-checked PASS).