NHIỆM VỤ: Implement GĐ6 — Auto-mode (mặc định TẮT) cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Working directory: C:\projects\nodejs\AIMailHelper. GĐ1-5 xong (HEAD = commit GD5).

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/TDD.md v1.1 — §5.5 (Auto-mode flow fail-closed), §8.6 (auto-mode fail-closed BR-02/BR-13), §7.4 (QUEUE_MAX 200), §11 checklist GĐ6 Done criteria, §6.1 (QUEUE_UPDATE chỉ nhận approved|rejected)
2. documents/AIMH-LOCAL/FSD.md v1.3 — UC-07 (Approve/Reject Auto-drafts: Main/Alt/Exception — AF-5 Approve all một phần lỗi, EF-2 chèn thất bại item về pending, EF-4 join email nguồn), FR-GD6-01..06, BR-02/BR-13/BR-01
3. documents/AIMH-LOCAL/TA-REVIEW-GD2.md + DEV-SECURITY-CHECKLIST — SR-11 (warning copy disclosure đầy đủ — ĐÃ có từ GĐ2, xác nhận còn nguyên), SR-14 (br01-audit giữ pass)
4. Code: src/options/components/AutomationSettings.tsx (toggle + confirm + batchSize từ GĐ2), src/content/modules/triage.ts + digest (GĐ5), reply flow GĐ4, queue.handler.ts (stub GĐ6)

## Deliverable GĐ6 (theo TDD §11 GĐ6 Done criteria — "luồng auto-draft → duyệt → chèn hoàn chỉnh"):
1. **src/content/modules/automode.ts** — khi enabled (và CHỈ khi enabled): MutationObserver theo dõi email mới đến trong reading pane/inbox → email mới → chạy analyze (tái dùng analyze module GĐ3) → nếu khớp rule (AutoModeRule: senderPattern/subjectPattern/minImportance) → sinh draft (reply flow GĐ4, KHÔNG chèn) → đưa vào hàng chờ. Rule rỗng → CHỈ analyze, KHÔNG draft (BR-13). TẮT → observer hủy đăng ký hoàn toàn, không schedule, không fetch tự động
2. **Queue management** — queue.autoDraft qua storage (QueueItem: id/messageId/draft/status pending|approved|rejected/createdAt): thêm item khi < QUEUE_MAX 200, vượt → KHÔNG thêm + cảnh báo (ERR code); QUEUE_LIST + QUEUE_UPDATE (chỉ nhận approved|rejected — giá trị khác ERR-15) qua queue.handler.ts (thay stub)
3. **Approve flow** — duyệt từng cái: item pending → approved → chèn vào Reply qua actions.insertDraft (GĐ4) với so khớp messageId (EF-5: email nguồn không còn mở → cảnh báo, giữ pending); chèn thất bại → item VỀ pending (EF-2) + ERR-09; Approve all: duyệt tuần tự từng item, item lỗi KHÔNG bị nuốt (AF-5 — báo danh sách lỗi sau); Reject → loại khỏi hàng chờ
4. **Tắt auto-mode khi còn hàng chờ** — queue.autoDraft GIỮ NGUYÊN, observer hủy, không tự hành động gì (FR-GD6-06); bật lại → hàng chờ phục hiện
5. **Panel hàng chờ duyệt** — UI list pending items (subject + preview draft), nút Approve/Reject từng cái + Approve all + số lượng; badge "N chờ duyệt"
6. **Tests** — mục tiêu ≥12 mới: rule engine (rules rỗng → analyze only spy draft 0 — BR-13; senderPattern match; subjectPattern case-insensitive; minImportance 69 vs 70 biên); MutationObserver chỉ đăng ký khi enabled; QUEUE_MAX 200 (item 201 từ chối + cảnh báo); QUEUE_UPDATE reject giá trị lạ; Approve → chèn (mock actions); chèn thất bại → về pending EF-2; Approve all một phần lỗi AF-5; tắt giữ queue FR-GD6-06; observer hủy khi tắt; pending → approved → chèn luồng hoàn chỉnh; khớp rule minImportance draft queue; tắt → 0 fetch tự động

## Ràng buộc
- ⛔ BR-01 TUYỆT ĐỐI: KHÔNG TỰ GỬI — mọi đường kết thúc ở compose box/hàng chờ; KHÔNG có code click nút Send (audit test phải vẫn pass)
- Fail-closed: enabled=false mặc định (đã có từ GĐ1); KHÔNG tồn tại code path bật tự động (chỉ AutomationSettings + confirm)
- File ≤200 dòng, function ≤20 dòng; KHÔNG đụng reply/vision/diagnose logic (tái dùng); KHÔNG đụng llm adapters
- i18n vi/en parity
- CHẠY THẬT: npm test + typecheck + lint + build — báo kết quả thật
- Commit: "AIMH-LOCAL: GD6 auto-mode — MutationObserver + hàng chờ duyệt + approve flow (BR-01/BR-02/BR-13 fail-closed)"

## Báo cáo khi xong
(1) files + số dòng; (2) KẾT QUẢ THẬT 4 lệnh (test tổng + mới); (3) BR-01/BR-02/BR-13/QUEUE_MAX/EF-2/AF-5/FR-GD6-06 chứng cứ; (4) commit hash; (5) hạn chế.