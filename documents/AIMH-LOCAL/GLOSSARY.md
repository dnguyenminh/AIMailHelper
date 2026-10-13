# GLOSSARY — AIMailHelper (AIMH-LOCAL)

> File-based glossary thay cho KB (mem tools không có trong phiên offline này). Mọi agent (TA / SA / DEV / QA / DevOps) cần đọc file này trước khi viết tài liệu hoặc code để thống nhất thuật ngữ. Mỗi entry gồm: **term** | **definition** | **avoid** (các từ/cách gọi cần tránh vì gây nhầm nghĩa).

| # | Term | Definition | Avoid (từ đồng nghĩa cần tránh) |
|---|------|------------|--------------------------------|
| 1 | OWA Adapter | Tầng middleware trong content script (src/content/owa-adapter/) chịu trách nhiệm đọc và thao tác với trang Outlook Web: detector (nhận diện reading pane / list view / conversation view), reader (đọc subject, sender, to/cc, body, thread), actions (mở reply box + điền draft), triage (đọc danh sách inbox hiển thị). Cô lập TOÀN BỘ thao tác DOM để phần còn lại của app không phụ thuộc cấu trúc trang OWA. | OWA API, Graph client, mail API, Outlook SDK |
| 2 | Self-healing Locator | Cơ chế định vị phần tử UI OWA 3 tầng: (1) multi-strategy selectors — role, aria-label (cả EN/VN), cấu trúc tree, <1ms và 0 token; (2) semantic locator — gửi a11y tree cho LLM định vị khi tầng 1 gãy, có cache; (3) vision fallback — screenshot + vision LLM, mặc định TẮT. Mục tiêu: extension vẫn hoạt động khi Microsoft thay đổi DOM OWA. | auto-fix DOM, DOM repair, web crawler, scraper |
| 3 | A11y Tree (Accessibility Tree) | Snapshot dạng text mô tả các phần tử tương tác của trang (role + label + ref), sinh bằng cách đi bộ DOM. Là "nguồn sự thật cấu trúc" thay cho screenshot — nguyên tắc "structure beats pixels". Chỉ gửi phần tử interactive, giới hạn max_chars. | DOM dump, HTML source, pixel map, screenshot |
| 4 | Ref ID | Định danh bền vững (ví dụ ref_12) gắn với từng phần tử trong a11y tree, lưu trong WeakRef element map. Mọi hành động (click, điền text) thực hiện QUA Ref ID chứ không qua tọa độ pixel — tránh hoàn toàn lỗi hệ tọa độ Retina/hiDPI (pattern của Claude in Chrome). | element index, XPath, CSS selector (như cơ chế chính), tọa độ pixel |
| 5 | LLM Provider / LLM Adapter | Provider: dịch vụ LLM người dùng chọn trong 6 loại (OpenAI, Azure OpenAI, Anthropic, Gemini, OpenAI-compatible tùy chỉnh, Local Ollama/LM Studio). Adapter: lớp TypeScript implement interface LLMAdapter (chat, chatStream, listModels, testConnection) cho từng provider, đăng ký trong registry. | model (chỉ là 1 trường config), AI engine, backend, server |
| 6 | Draft (bản nháp) | Nội dung trả lời do AI sinh ra, CHỈ được chèn vào khung Reply (compose box) của OWA qua actions.ts. Send luôn là hành động của người dùng trong OWA — extension không có code tự bấm Send trong bất kỳ luồng nào. | auto-send, auto-reply (gửi thẳng), gửi hộ, send on behalf |
| 7 | Triage / Digest | Triage: quét danh sách email ĐANG HIỂN THỊ trong inbox list (không tải thêm mail), batch analyze có throttle + retry/backoff để chấm điểm mức độ quan trọng. Digest: bảng ưu tiên tổng hợp từ kết quả triage — email + điểm + lý do, sắp xếp theo score. Kết quả cache theo message-id trong chrome.storage.local. | spam filter, inbox zero, full mailbox sync, readonly scan toàn bộ |
| 8 | Auto-mode | Chế độ tùy chọn (MẶC ĐỊNH TẮT) mà extension tự phân tích email mới đến (MutationObserver) và tự sinh draft theo rule (sender / subject / mức độ), đưa vào HÀNG CHỜ DUYỆT. Người dùng duyệt từng cái hoặc Approve all; sau duyệt chỉ CHÈN vào Reply — không bao giờ tự gửi. | autopilot, full auto, auto-send, background sender |

| 9 | Analysis Result | Kết quả phân tích 1 email (GĐ3), gồm 5 khía cạnh: summary (tóm tắt), importanceScore + importanceLabel (độ quan trọng, hiển thị badge màu), intent (ý định), actions[] (hành động cần làm), deadline, sentiment (cảm xúc). Stream về panel qua Port messaging. | email metadata, mail header, raw body |
| 10 | Layout Hash | Hash của cấu trúc layout OWA, dùng làm "phiên bản layout": locator-cache gắn kết quả định vị kèm hash — khi Microsoft đổi UI thì hash đổi → cache TỰ VÔ HIỆU và tầng 2 (semantic locator) chạy lại đúng 1 lần. Khác với cache triage (khóa theo message-id). | cache key message-id (khác mục đích), version string, build number |

## Ghi chú sử dụng

- Khi đặt tên biến/class/tài liệu, dùng đúng term ở cột **Term** (ví dụ: OwaAdapter, SemanticLocator, LocatorCache, RefId, AnalysisResult, TriageScore, LayoutHash).
- Tránh dùng các từ ở cột **Avoid** khi nói về cùng một khái niệm — chúng hoặc sai nghĩa, hoặc chỉ tới khái niệm khác đã định nghĩa riêng.
- Nguồn tham chiếu: PLAN.md (mục 3, 4, 6), BRD.md (mục 9.1), REFERENCE-ANALYSIS.md.
