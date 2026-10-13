NHIỆM VỤ: BA feedback review FSD v1.1 cho ticket **AIMH-LOCAL** (placeholder offline — KHÔNG gọi Jira). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Bối cảnh
FSD v1.0 do BA viết (documents/AIMH-LOCAL/FSD.md), sau đó TA đã enrich lên v1.1 (1969-1970 dòng): bổ sung 13 AF/EF flows, 4 storage keys, ChatOptions, API contracts chi tiết 6 providers (5.2.0–5.2.6), Port lifecycle + payload schema (5.3.x), storage quota + migration (5.4.1), 6 pseudocode (6.6a-f), ERR-15/16, 7 NFR định lượng, Open Issues cập nhật còn 11 mục.

Bạn (BA) review phần TA enrich về MẶT NGHIỆP VỤ theo 3 việc sau (theo yêu cầu orchestrator):

## Việc 1 — Resolve 11 data entities UNVERIFIED
Trong FSD có 11 entities đánh dấu UNVERIFIED (chờ SA): ProviderId, LLMConfig, ChatMessage, LLMResponse, ChatOptions, EmailData, AnalysisResult, ReplyDraft, TriageScore, LocatorCacheEntry, AutoModeRule/QueueItem/PendingAutoDraft. Vì dự án greenfield (chưa có codebase), "verified" nghĩa là: khớp với BRD (documents/AIMH-LOCAL/BRD.md user stories + data fields) và khớp PLAN.md. Review từng entity theo tiêu chí nghiệp vụ:
- Đủ trường cho mọi Acceptance Criteria liên quan không? (vd: AnalysisResult cần đủ summary/importanceScore/importanceLabel/intent/actions/deadline/sentiment để render panel + badge màu; TriageScore cần score + lý do cho Digest)
- Có trường nào thừa ngoài scope BRD không? → đánh dấu REMOVE hoặc ghi chú "giữ cho tương lai, out of MVP"
- Cập nhật trực tiếp trong FSD: đổi "(UNVERIFIED chờ SA)" thành "(BA-REVIEWED v1.2 — khớp BRD US-xx)" hoặc sửa entity nếu lệch.

## Việc 2 — Resolve Open Issues BA-owned
Trong mục Open Issues (mục 12) của FSD, các issue này thuộc thẩm quyền BA — resolve hoặc chuyển thành quyết định có ghi nhận (cập nhật trạng thái trong bảng):
- #2 (Anthropic listModels CORS): quyết định nghiệp vụ — nếu CORS chặn thì UI ẩn nút "fetch models" cho Anthropic và chỉ cho nhập tay model (ghi thành BR rule mới nếu cần, đánh số tiếp BR-17...)
- #4 (max_chars a11y snapshot 20K): chấp nhận đề xuất TA hay điều chỉnh? Xem xét theo BR về chi phí token + privacy
- #1 (Ollama stream format): đây là kỹ thuật nhưng cần BA xác nhận nghiệp vụ chấp nhận phương án TA đề xuất (SSE làm chính) — đánh dấu "BA acknowledged"
- Rà 11 Open Issues: mục nào BA quyết được thì chốt (ghi "RESOLVED — BA decision: ..."), mục nào thuộc SA thì đổi trạng thái thành "→ SA decides in TDD"

## Việc 3 — Xác nhận 45 FR map đúng 6 GĐ
Kiểm tra bảng FR (FR-GD1-01..FR-GD6-xx): (a) mỗi FR có nguồn US-xx từ BRD không; (b) không có FR nào lệch GĐ (vd FR auto-mode phải thuộc GĐ6); (c) không thiếu FR cho AC nào trong BRD. Sửa trực tiếp nếu sai, ghi kết quả rà vào cuối mục FR dạng bảng tóm tắt đếm số FR/GĐ.

## Quy tắc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh
- KHÔNG sửa 5.2/5.3 (API contracts — TA domain), KHÔNG sửa 6.6 pseudocode (SA sẽ dùng), KHÔNG sửa diagrams, KHÔNG Mermaid, KHÔNG Jira, KHÔNG DOCX
- Edit trực tiếp documents/AIMH-LOCAL/FSD.md; cập nhật Revision History thêm dòng "1.2 | date | BA Agent | BA feedback review: entities verified, Open Issues resolved, FR mapping confirmed"
- KHÔNG phụ thuộc KB (mem_search đang lag) — đọc files trực tiếp

## Báo cáo khi xong
(1) số entity đã verified / số entity sửa; (2) danh sách Open Issues đã resolve + trạng thái mới từng mục; (3) kết quả rà FR mapping (số FR mỗi GĐ, sửa gì); (4) BR mới (nếu có).