NHIỆM VỤ: Implement GĐ4 — Soạn trả lời AI + T3 vision + Diagnose cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Working directory: C:\projects\nodejs\AIMailHelper. GĐ3 xong (commit c12a456, 199/199 tests). Đọc documents/AIMH-LOCAL/TA-REVIEW-GD2.md (tech debt) — TD-4 logger wire ở GĐ3 đã qua, ghi nhận.

## ⚠️ BẮT BUỘC LÀM ĐẦU BATCH (3 CR từ TA review GĐ3 — điều kiện Done GĐ4):
1. **CR-A** — port-server.ts N-1: wrap aborts entry (set → invokeHandler → delete) trong try/finally — port disconnect giữa stream không để orphan entry; + 1 test: postMessage throw giữa stream (mock) → entry trong aborts map đã được dọn
2. **CR-B** — tạo `documents/AIMH-LOCAL/OWA-DOM-SPIKE.md`: file giả định selector cần verify khi test OWA thật — liệt kê TỪNG probe/chain trong selectors.ts + detector.ts + message-id.ts + a11y-tree (MESSAGE_PROBE, DIALOG_PROBE, MAIN_PROBE, data-conversation, data-itemid, href AAMk regex, aria-label body, reply/compose chains) với cột: Selector | File | Giả định (pattern OWA phổ biến) | Cách verify trên OWA thật (DevTools steps) | Trạng thái (UNVERIFIED). KHÔNG bịa kết quả verify — đây là checklist cho spike manual (user/QA chạy trên OWA thật GĐ4-complete)
3. **CR-C** — audit.test.ts: thêm rule grep biên DOM — `document.querySelector|document.createElement|document.getElementById` CHỈ được dùng trong src/content/owa-adapter/** + shadow-root.ts + Panel (querySelector trên shadow root của chính mình) + files test; vi phạm → fail; + update comment
4. **TD-7** — TDD §7.5 cập nhật: S3 synthetic id KHÔNG dùng sentAt-approx (hành vi hiện tại — id bền giữa re-render, an toàn hơn spec) — 1 dòng ghi quyết định SA (bạn có quyền SA-lite amendment, ghi vào Revision History v1.2)

## Deliverable GĐ4 chính (theo TDD §11 GĐ4 + FSD UC-02/UC-09 + FR-GD4-01..08):
1. **owa-adapter/actions.ts** — openReplyBox() (click reply-button qua locate BR-12 chain) + insertDraft(text) (compose-box locate → native setter + execCommand insertText + dispatch input event cho React; draft rỗng → chặn BR-10; compose có nội dung → trả needs-confirm AF-5; KHÔNG BAO GIỜ click Send — BR-01, send-button chỉ selectors diagnose)
2. **owa-adapter/vision-fallback.ts** — T3 opt-in (BR-03, mặc định TẮT): captureVisibleTab → nén canvas (target ~1568px) → vision LLM (chatStream/visionImage ChatOptions từ GĐ2) → parse (x%,y%) → elementFromPoint + verifyElement (SR-08) → chỉ khi T1+T2 fail; KHÔNG persist ảnh; điều kiện kép config.vision.enabled + per-call opt-in
3. **owa-adapter/diagnose.ts** — UC-09: log cấu trúc DOM/a11y tìm thấy; label chỉ giữ cho control chức năng, node khác "[redacted-label]" (M-2); body redact; xuất report text user copy; cảnh báo privacy (EF-3)
4. **src/content/modules/reply.ts** — UC-02: từ panel kết quả analyze → chọn tone (chính thức/thân mật/ngắn gọn) + ngôn ngữ (theo email gốc/bắt buộc VI/EN) + hướng dẫn thêm → reply prompt (prompts.ts kind reply — fence + clause có sẵn) → stream draft qua Port → preview panel → nút "Chèn vào Reply" → actions.insertDraft; so khớp messageId khi chèn (EF-5 — email đổi giữa chừng → cảnh báo, không chèn tự động); ERR-09 insertFailed → copy tay fallback
5. **Panel mở rộng** — Preview draft (streaming) + tone/language selector + textarea hướng dẫn thêm + nút Chèn (disabled khi draft rỗng BR-10) + needs-confirm dialog (AF-5) + warning khác email (EF-5) + nút Diagnose (UC-09)
6. **reply handler** — stream.handler thêm kind "reply" (tương tự analyze, temperature 0.7 per GĐ2 defaults); config PROMPT_SETTINGS tone/language qua CONFIG_SET
7. **Tests** — actions (insertDraft React-safe fixture + BR-10 + AF-5 + KHÔNG click Send audit); vision-fallback (mock captureVisibleTab + vision LLM; disabled mặc định → 0 capture — BR-03 test); diagnose redact test (M-2: subject/sender không xuất hiện trong report); reply flow (stream → preview → insert; EF-5 mismatch; ERR-09); CR-A port disconnect test; CR-C audit rule test. Mục tiêu ≥25 test mới

## Ràng buộc
- File ≤200 dòng, function ≤20 dòng; SOLID; KHÔNG đụng llm adapters GĐ2 (chỉ dùng); triage/auto-mode (GĐ5/6)
- SR-10 audit pass; BR-01 audit pass (KHÔNG có code click Send — audit test đã có, giữ pass)
- KHÔNG test OWA thật (manual — ghi vào OWA-DOM-SPIKE.md checklist + STC TC-410/415 evidence NOT_RUN)
- CHẠY THẬT: npm test + typecheck + lint + build — báo kết quả thật
- Commit: "AIMH-LOCAL: GD4 reply + vision T3 + diagnose + CR-A/B/C (spike checklist + port try/finally + DOM boundary audit)"

## Báo cáo khi xong
(1) 3 CR đầu batch — chứng cứ từng cái; (2) files + số dòng; (3) KẾT QUẢ THẬT 4 lệnh (số test tổng + mới); (4) BR-01/BR-03/BR-10/AF-5/EF-5/EF-9/M-2 chứng cứ; (5) commit hash; (6) OWA-DOM-SPIKE.md — số selector liệt kê, trạng thái UNVERIFIED; (7) hạn chế (manual OWA thật pending — ghi rõ).