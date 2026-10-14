NHIỆM VỤ: Implement GĐ5 — Triage hộp thư cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Working directory: C:\projects\nodejs\AIMailHelper. GĐ1-4 xong (203/203 tests trước GĐ5; HEAD = commit GD4).

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/TDD.md v1.1 — §3.1.6 (triage.ts BR-07), §5.4 (Triage batch flow — khớp pseudocode 6.6d), §7.4 (caps: TRIAGE_SCAN_CAP 50, LRU 500, QUEUE_MAX 200), §7.5 (message-id S1/S2/S3 — SR-09 SHA-256), §11 checklist GĐ5 Done criteria
2. documents/AIMH-LOCAL/FSD.md v1.3 — 6.6d (pseudocode triage batch throttle + backoff), UC-03 (Triage Inbox Main/Alt/Exception: AF-4 backoff, AF-5 virtualized list "Quét tiếp", EF-4 folder đổi giữa chừng), UC-04 (View Digest — EF-1 Digest trống → hướng dẫn), FR-GD5-01..06, BR-07/BR-09
3. documents/AIMH-LOCAL/TA-REVIEW-GD3.md — TD-8: **thêm cap TriageScore.reason ≤300 + test khi viết parse triage** (M-1 bảng lớp 3 — BẮT BUỘC ở GĐ5)
4. Code hiện tại: src/content/owa-adapter/ (selectors inbox-list/inbox-item chains), src/shared/cache-store.ts (typed wrapper local), src/shared/llm/prompts.ts (kind triage temperature 0.2), stream.handler.ts (pattern analyze)
5. documents/AIMH-LOCAL/OWA-DOM-SPIKE.md — thêm probes triage cần verify (inbox-list/inbox-item chains) vào checklist

## Deliverable GĐ5 (theo TDD §11 GĐ5 Done criteria — "quét inbox hiện tại, badge + Digest hoạt động"):
1. **owa-adapter/triage.ts** — đọc danh sách email ĐANG HIỂN THỊ trong inbox list (KHÔNG tải thêm — BR-07): mỗi item → {messageId (S1/S2/S3), subject, sender, preview} qua inbox-item locate; folderChanged detection (MutationObserver lightweight hoặc check giữa batch)
2. **src/content/modules/digest.ts (hoặc triage module)** — batch analyze: chia batchSize (config.automation.batchSize 5) + throttleMs 1000; retry/backoff 429 Retry-After / 1-2-4s / 5xx 2-4-8s (tái dùng call.ts GĐ2) — CHỈ pre-first-chunk; MAX_RETRY_BATCH 3 hết lượt → item "chưa chấm" không gián đoạn (EF flow); progress {done, total, failed} qua Port
3. **parseTriageScore** — validate: score 0..100 integer, reason ≤300 (TD-8 — M-1), messageId khớp; fail → item "chưa chấm" + log, KHÔNG gián đoạn batch (FR-GD5-06)
4. **Badge render** — badge màu trên inbox list item (createElement/textContent — SR-10; chèn qua owa-adapter, không đụng DOM trực tiếp); màu theo score (đỏ ≥70 / cam 40-69 / xanh <40 — theo FSD UI spec)
5. **Digest panel** — panel liệt kê email ưu tiên: subject + score + LÝ DO (reason), sort score giảm dần (FR-GD5-04); cache hit hiển thị "đã quét" — lần 2 KHÔNG gọi LLM cho item đã có (BR-09); Digest trống → hướng dẫn "Chạy Triage trước" (UC-04 EF-1)
6. **Cache** — cache.triage.{messageId} qua cache-store (LRU 500 eviction theo analyzedAt — SR-09 đã có S3); "Quét tiếp" (AF-5 virtualized list) — quét phần mới hiển thị, giữ kết quả cũ
7. **triage.handler / stream** — kind "triage" qua Port (progress events); folder đổi giữa chừng → dừng an toàn giữ kết quả batch hiện tại (EF-4)
8. **Tests** — mục tiêu ≥12 mới: triage.ts đọc list (fixture inbox); batch chia 3+3+3+1 (batchSize 3 — TC-118 pattern); backoff 429 Retry-After 2s + không header 1-2-4s + MAX_RETRY 3; progress đúng; cache hit 0 LLM (BR-09); cap 50 (60 item → quét 50 + thông báo); folder đổi dừng; parse reason >300 REJECT (TD-8); badge render createElement; Digest sort + EF-1 trống; messageId thiếu → bỏ qua + log (FR-GD5-06)

## Ràng buộc
- File ≤200 dòng, function ≤20 dòng; SOLID; KHÔNG đụng reply/vision/diagnose (GĐ4 closed); KHÔNG đụng auto-mode (GĐ6)
- BR-07: KHÔNG tải thêm mail ngoài list hiển thị; SR-10 audit pass
- i18n vi/en đủ keys mới (parity)
- CHẠY THẬT: npm test + typecheck + lint + build — báo kết quả thật
- Commit: "AIMH-LOCAL: GD5 triage — inbox scan + batch analyze throttle/backoff + badge + Digest + cache LRU"

## Báo cáo khi xong
(1) files + số dòng; (2) KẾT QUẢ THẬT 4 lệnh (số test tổng + mới); (3) TD-8 reason cap chứng cứ; (4) BR-07/BR-09/EF-1/EF-4/AF-5 chứng cứ; (5) commit hash; (6) probes triage thêm vào OWA-DOM-SPIKE.md; (7) hạn chế.