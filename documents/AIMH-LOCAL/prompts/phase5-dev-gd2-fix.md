NHIỆM VỤ: Fix batch theo TA review GĐ2 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. Đọc documents/AIMH-LOCAL/TA-REVIEW-GD2.md (verdict CHANGES REQUESTED) + TA-FOLLOWUP-GD1.md. Commit hiện tại f720a7c, 94/94 tests.

## MUST-FIX (3 CR):
1. **CR-1** — azure.apiVersion validation (D-3): thêm regex `^\d{4}-\d{2}-\d{2}$` cho `azure.apiVersion` trong src/shared/storage-schema.ts (BR-15); + test case sai format → reject, đúng format → pass
2. **CR-2** — PortServer terminal event guard (D-4): PortServer.run() — track hasSent; catch handler throw → nếu CHƯA gửi terminal event nào (chỉ có accepted) → gửi `{type:"error", code:"ERR-15", i18nKey:"errors.streamFailed", retryable:false}` terminal; + test: handler throw ngay → client nhận error event (không treo)
3. **CR-3** — Retry timeout 1 lần pre-first-chunk (FSD 5.2.0 / TDD §9.2): call.ts — AbortError/timeout khi CHƯA nhận chunk → retry đúng 1 lần; đã nhận chunk → KHÔNG retry (giữ + ERR-04); + test: timeout lần 1 → retry → success; timeout lần 2 → ERR-04

## NÊN-FIX (3 tech debt nhỏ, gộp cùng batch — rẻ, cùng vùng code):
4. **TD-1** — ChatTest.stop(): gọi `StreamHandle.cancel()` (gửi {type:"cancel"}) thay vì disconnect()
5. **TD-2** — Anthropic listModels phân trang: thêm max-page guard 10 trang
6. **TD-3** — Integration-lite test CONFIG_GET/CONFIG_SET/KEY_STORAGE_SET: wire MessageRouter vào chrome mock (mock đã hỗ trợ); test CONFIG_GET trả hasKey + KHÔNG apiKey (BR-08); CONFIG_SET validate BR-15 reject enum sai

## Ràng buộc
- KHÔNG đụng kiến trúc; file ≤200 dòng, function ≤20 dòng
- KHÔNG phá 94 test hiện có; KHÔNG Jira/Mermaid/DOCX
- CHẠY THẬT: npm test + typecheck + lint + build — báo kết quả thật
- Commit: "AIMH-LOCAL: GD2 fix batch — CR-1..3 (TA review) + TD-1..3 (tech debt nhỏ)"

## Báo cáo khi xong
(1) từng fix ở file nào + số dòng; (2) KẾT QUẢ THẬT test/typecheck/lint/build (số test tổng); (3) commit hash; (4) xác nhận 6 mục đã xử lý.