NHIỆM VỤ: Tạo FSD v1 cho ticket **AIMH-LOCAL** (placeholder offline — Jira KHÔNG khả dụng, KHÔNG gọi công cụ Jira, không bịa ticket key/URL). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper.

## Nguồn sự thật (đọc trước khi viết)
1. documents/AIMH-LOCAL/BRD.md — input chính (business requirements đã duyệt)
2. documents/AIMH-LOCAL/GLOSSARY.md — dùng đúng thuật ngữ
3. PLAN.md — chi tiết kỹ thuật đã chốt (cấu trúc thư mục mục 4, LLM provider layer mục 5, OWA adapter 3 tầng mục 6, 6 giai đoạn mục 7)
4. documents/templates/FSD-TEMPLATE.md — theo cấu trúc template
5. .opencode/skills/phase-2-specification/SKILL.md + .opencode/skills/drawio-diagrams/SKILL.md

## Nhiệm vụ — TẠO FSD DRAFT (bản đầy đủ business sections)
Tạo documents/AIMH-LOCAL/FSD.md (v1). KHÔNG cần UI-agent mockup (dashboard trang Options đã có mô tả component chi tiết trong PLAN.md; wireframe vi/en sẽ do dev-agent triển khai theo DESIGN-SYSTEM — ghi chú điều này trong section UI Specifications thay vì để trống).

FSD bắt buộc có:
- Overview + scope (in/out) khớp BRD
- Use Cases có ID (UC-xx): Analyze Email, Draft Reply, Triage Inbox, View Digest, Configure LLM Provider, Test Connection, Approve/Reject Auto-draft, Switch Language, Diagnose OWA Layout — mỗi UC có Main flow / Alternative flows / Exception flows
- Business Rules bảng (BR-xx): ví dụ BR-01 không tự bấm Send; BR-02 auto-mode mặc định OFF; BR-03 vision fallback mặc định OFF; BR-04 API key sync mặc định, tùy chọn local-only; BR-05 email data chỉ gửi tới endpoint user cấu hình; BR-06 cache locator vô hiệu khi layout hash đổi; BR-07 triage chỉ quét danh sách đang hiển thị...
- Functional Requirements theo 6 GĐ (FR-GD1-xx ... FR-GD6-xx), đánh dấu nguồn user story
- Data Specifications: EmailData, AnalysisResult, ReplyDraft, TriageScore, LLMConfig, ChatMessage, LLMResponse, ProviderId, LocatorCacheEntry — định nghĩa TypeScript interface dạng bảng + code block
- API / Integration Specifications (phần này ghi khung, TA sẽ enrich): LLM provider endpoints từng nhà (OpenAI, Azure OpenAI, Anthropic + header riêng, Gemini, OpenAI-compatible, Local Ollama/LM Studio), request/response, streaming SSE/chunk qua Port
- UI Specifications: mô tả các màn (popup, options với 6 section theo PLAN.md mục 4, panel AI Shadow DOM, Digest panel, hàng chờ duyệt auto-mode) + tham chiếu design system documents/templates/DESIGN-SYSTEM.md; ghi chú wireframe chi tiết do DEV làm trong GĐ1-2
- Error Handling matrix: lỗi CORS, lỗi 401/429/timeout LLM, OWA DOM không tìm thấy (tầng 1 fail → tầng 2), storage quota, stream đứt
- Non-Functional Requirements có chỉ số định lượng
- i18n spec: vi.json/en.json key structure, ngôn ngữ trả lời AI độc lập ngôn ngữ UI
- Open Issues (nếu có)

## Draw.io diagrams (BẮT BUỘC, KHÔNG Mermaid) tại documents/AIMH-LOCAL/diagrams/
1. system-context.drawio + system-context.png — extension <-> OWA DOM <-> LLM providers (6), chrome.storage
2. sequence-analyze-email.drawio + .png — content script → service worker → LLM adapter → streaming Port → panel render
3. sequence-reply-draft.drawio + .png — chọn tone → LLM stream → preview → chèn compose box qua actions.ts (dừng trước nút Send)
4. state-locator.drawio + .png — state machine self-healing: idle → tier1 selectors → (fail) tier2 semantic+cache → (fail, opt-in) tier3 vision → error/diagnose
Quy tắc XML: bắt đầu mxGraphModel, KHÔNG bọc mxfile, edge không self-closing, màu semantic. Export PNG bằng drawio CLI; thất bại thì ghi THẬT trong section Diagrams cuối FSD.

## Ràng buộc
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh
- KHÔNG Mermaid, KHÔNG Jira, KHÔNG DOCX
- Không viết code sản phẩm

## Báo cáo khi xong
(1) đường dẫn file tạo; (2) số UC, số BR, số FR theo GĐ; (3) trạng thái export PNG thật; (4) hạn chế nếu có.