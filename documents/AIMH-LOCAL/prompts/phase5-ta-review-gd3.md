NHIỆM VỤ: TA review implementation GĐ3 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ3 Đọc & Phân tích email xong (commit c12a456 + de84aba): 199/199 tests (+92), 14 file src mới.

## Đầu vào
1. documents/AIMH-LOCAL/DEV-GD3-IMPLEMENTATION-SUMMARY.md — dev-agent mô tả
2. documents/AIMH-LOCAL/TDD.md v1.1 — §3.1 (owa-adapter 3 tầng + §3.1.1 selector chains + §3.1.2 semantic locator + invariant #8), §5.3 (sequence), §7.2/§7.5 (cache + message-id S1/S2/S3), §8.4 (SR-02), §8.11 L3 (caps + refId), §11 GĐ3 Done criteria
3. documents/AIMH-LOCAL/FSD.md v1.3 — 6.6a-f (pseudocode chuẩn), UC-01, FR-GD3-01..07
4. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — M-1/M-2/SR-08/SR-09 items GĐ3
5. documents/AIMH-LOCAL/TA-FOLLOWUP-GD1.md — N-1 (port-server aborts try/finally)
6. Code: git show c12a456 (diff lớn — đọc theo file), src/content/owa-adapter/**, src/content/modules/analyze.ts, src/shared/analysis.ts

## Checklist review ×9:
1. **Design conformance** — chuỗi T1→cache→T2 đúng BR-12 (T1 hit không chạm cache)? cache invalidation theo layoutHash đúng BR-06? invariant #8 persist chỉ strategy="selector" có test?
2. **a11y-tree SR-02** — AND condition thật? KHÔNG fallback text-80? listitem/paragraph không xuất text? MAX 20K/depth 18? WeakRef map đúng (không giữ reference cứng)?
3. **SR-08** — locator-expectations đủ 6 FunctionKey? verifyElement SAU deref? fail → tier thất bại không dispatch?
4. **SR-09** — layout-hash SHA-256 crypto.subtle? KHÔNG hash nội dung email? message-id S3 trunc 16 hex?
5. **M-1 (SR-01 L3)** — validateAnalysisResult caps (score 0..100 reject, actions ≤10×200, summary/intent/sentiment ≤1000, reason ≤300)? parseRefId fail-closed (chỉ /ref_\d+)? refId hallucinate → không dispatch? 0 eval?
6. **BR-14 + AF-4** — reader gate bodyText rỗng → ERR-10 không gọi LLM? cancel khi đổi email?
7. **Detector/reader** — structural probe đúng (không đoán theo text)? messageId chain S1→S2→S3 đúng §7.5? normalize bodyText qua textContent (SR-10)?
8. **Deviations** — cache-store.ts tách khỏi storage.ts? selectors.ts làm canonical FunctionKey (phá vòng import)? 6 deviations trong summary §4?
9. **OWA-DOM-SPIKE.md** — file chưa tồn tại! Đánh giá: đây có là CR bắt buộc trước GĐ4 không (spike selector thật là mốc GĐ4 theo PLAN mục 8)? N-1 (port-server try/finally orphan aborts) — đưa vào CR hay để batch GĐ4?

## Verdict: **APPROVED** / **APPROVED with warnings** / **CHANGES REQUESTED** (list cụ thể — KHÔNG tự sửa code)

## Quy tắc
KHÔNG sửa code; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX. Báo cáo: bảng checklist ×9 + verdict + tech debt list.