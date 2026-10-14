NHIỆM VỤ: Implement GĐ3 — Đọc & Phân tích email đang mở cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Working directory: C:\projects\nodejs\AIMailHelper. GĐ1+GĐ2 xong (107/107 tests, commits 39c29ad/f720a7c/5a980fd). Read documents/AIMH-LOCAL/TA-FOLLOWUP-GD1.md — D-2 decision mặc định: giữ (a) uiLanguage storage-direct, SA ghi chú TDD.

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/TDD.md v1.1 — §3.1 (owa-adapter Facade 3 tầng CHI TIẾT: detector/reader/actions/triage + a11y-tree + semantic-locator + locator-cache §3.1.1/3.1.2), §5.3 (sequence semantic locator), §7.2 (LocatorCacheEntry invariant strategy="selector"), §8.4 (PII snapshot SR-02), §8.11 (§3 refId khớp element map), §11 checklist GĐ3 Done criteria
2. documents/AIMH-LOCAL/FSD.md v1.3 — mục 6.2/6.6a-f (pseudocode CHUẨN: a11y walker 6.6a ĐÃ SỬA theo SR-02: AND condition + không fallback text-80 + listitem không text; semantic locator 6.6b T1→cache→T2; layout hash 6.6c), UC-01 (Analyze Email Main/Alt/Exception), FR-GD3-01..07
3. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — items GĐ3: M-1 (SR-01 áp §8.11 vào code GĐ3: validateAnalysisResult caps + refId khớp element map), M-2 (SR-02 a11y-tree AND + listitem không text), SR-08 (locator-expectations.ts verify element sau deref), SR-09 (SHA-256 crypto.subtle cho layoutHash)
4. Code hiện tại: src/content/owa-adapter/ (owa-adapter.ts Facade + selectors.ts T1 có sẵn), src/background/handlers/locator.handler.ts (stub GĐ3), src/shared/llm/prompts.ts (systemPrompt analyze có sẵn — dùng), tests/mocks/chrome.ts

## Deliverable GĐ3 (theo TDD §11 GĐ3 Done criteria — "mở 1 email trong OWA → bấm phân tích → thấy kết quả trong vài giây"):
1. **owa-adapter/detector.ts** — nhận diện chế độ OWA: reading-pane / popout / conversation / unknown (structural probe theo TDD §3.1.1, KHÔNG đoán theo text)
2. **owa-adapter/reader.ts** — đọc email: subject, sender, to/cc, bodyText (normalize qua textContent — SR-10), thread context (conversation), messageId (S1 attribute probe → S2 href regex AAMk → S3 synthetic SHA-256 — SR-09, §7.5); BR-14: bodyText rỗng → ERR-10 KHÔNG gọi LLM
3. **owa-adapter/a11y-tree.ts** — walker theo 6.6a ĐÃ SỬA (SR-02): AND condition (INTERACTIVE_ROLES && hasMeaningfulLabel), KHÔNG fallback text-80, listitem/paragraph/document không xuất text, MAX_SNAPSHOT_CHARS 20.000, MAX_DEPTH 18, refId qua WeakRef map (refByElement WeakMap + elementsByRef Map)
4. **owa-adapter/semantic-locator.ts** — T1 fail → đọc cache (layoutHash khớp) → build snapshot → LOCATOR_RESOLVE qua SW (LLM trả refId) → deref + verify qua expectations (SR-08) → chuyển refId thành structural selector khi GHI cache (Open Issue #8 — chỉ persist strategy="selector")
5. **owa-adapter/locator-cache.ts** — key cache.locator.{functionKey}, entry kèm layoutHash; hash khác → coi như không tồn tại; sau T2 thành công xóa entry hash cũ
6. **owa-adapter/layout-hash.ts** — SHA-256 qua crypto.subtle.digest (SR-09): hash signature 3 cấp (tag+role) của 4 vùng probe — KHÔNG hash nội dung email
7. **owa-adapter/locator-expectations.ts** — expectation map per FunctionKey (SR-08): reply-button → button + /reply|trả lời/i; compose-box → textbox; reading-pane → main|document|article; verifyElement(key, el) sau deref — fail → tier thất bại, KHÔNG dispatch
8. **locator.handler.ts** — thay stub: build prompt locate (systemPrompt "locate" temperature 0 maxTokens 512) → chat → parse refId → validate khớp element map (SR-01 L3) — KHÔNG eval
9. **src/content/modules/analyze.ts** — GĐ3 module: đọc email qua reader → serializeEmailData (fence từ GĐ2) → chat analyze stream → parse AnalysisResult (validateAnalysisResult caps: score 0..100 reject EF-6, actions ≤10×200, summary/intent/sentiment ≤1000 — §8.11 L3)
10. **Panel AI render** — Panel.tsx mở rộng: nút "AI phân tích" vào toolbar email + panel Shadow DOM hiển thị streaming 5 khía cạnh (summary/importance badge màu theo score/intent+actions/deadline/sentiment) + nút Soạn trả lời (disabled — GĐ4) + consent banner (SR-18 optional — render lần đầu analyze) + EF-6 raw hiển thị + nút Thử lại (ERR-07)
11. **analyze.handler.ts / stream qua Port** — analyze chạy qua SW + Port streaming (tái dùng stream.handler pattern GĐ2), cancel khi đổi email (AF-4)
12. **Tests** — jsdom fixtures: detector 3 chế độ; reader BR-14; a11y walker SR-02 (fixture chứa body text → snapshot KHÔNG chứa text email — M-2 test bắt buộc); semantic locator flow (T1 fail → cache miss → mock LLM refId → verify fail→tier fail); locator cache invalidation (hash đổi → vô hiệu); layout hash determinism + không đổi theo nội dung email; validateAnalysisResult caps (M-1: score 150 → EF-6); prompt injection fixture "Ignore previous instructions" → parse fail-closed (TC-601 precursor)

## Ràng buộc
- File ≤200 dòng, function ≤20 dòng, SOLID (Facade + Strategy tiers + Observer MutationObserver để sau)
- KHÔNG đụng llm adapters (GĐ2 done); KHÔNG đụng reply/draft logic (GĐ4); triage/digest (GĐ5)
- SR-10 audit test phải vẫn pass (0 innerHTML)
- CHẠY THẬT: npm test + typecheck + build + lint — báo kết quả thật
- Commit: "AIMH-LOCAL: GD3 analyze — owa-adapter detector/reader/a11y/locator T1+T2 + panel AI + anti-injection L3"

## Báo cáo khi xong
(1) danh sách file + số dòng; (2) KẾT QUẢ THẬT 4 lệnh (số test tổng + mới); (3) M-1/M-2/SR-08/SR-09 chứng cứ; (4) commit hash; (5) hạn chế (spike DOM OWA thật — ghi chú); (6) Determination: detector/reader chưa test trên OWA thật — spike bắt buộc ghi chú.