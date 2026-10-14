NHIỆM VỤ: TA review implementation GĐ5 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ5 Triage xong (commit 8943886, diff a5ec838..8943886): 319/319 tests (+49).

## Đầu vào
1. documents/AIMH-LOCAL/DEV-GD5-IMPLEMENTATION-SUMMARY.md
2. documents/AIMH-LOCAL/TDD.md v1.1 — §3.1.6 (triage.ts BR-07), §5.4 (batch flow), §7.4 (caps LRU 500/cap 50), §8.11 L3 (TD-8 reason ≤300), §11 GĐ5 Done criteria
3. documents/AIMH-LOCAL/FSD.md v1.3 — 6.6d (pseudocode batch), UC-03/UC-04, FR-GD5-01..06, BR-07/BR-09
4. documents/AIMH-LOCAL/OWA-DOM-SPIKE.md — +7 probes triage #39-45
5. Code: git show 8943886 (diff), src/shared/triage.ts, src/content/owa-adapter/{triage,triage-cache}.ts, src/content/modules/digest*.ts, src/background/handlers/triage.handler.ts, DigestView.tsx

## Checklist review ×9:
1. **BR-07** — chỉ quét listitem BÊN TRONG list (scope querySelectorAll)? KHÔNG fetch/pagination? folder guard EF-2/EF-4 (hasFolderChanged TRƯỚC MỖI batch → dừng giữ kết quả)?
2. **6.6d batch** — BR-09 filter cache TRƯỚC chia batch (cached 0 LLM)? cap 50 + "Quét tiếp" AF-5? batchSize + throttle đúng? MAX_RETRY_BATCH 3 + backoff 429 Retry-After / 1-2-4s / 5xx 2-4-8s + cap 10s?
3. **TD-8 (M-1 L3)** — reason ≤300 REJECT fail-closed (3 tầng test: shared + SW IT + controller)? score int 0..100? id hallucinate REJECT? item lỗi KHÔNG gián đoạn batch (FR-GD5-06)?
4. **SR-09** — message-id S1/S2/S3 (SHA-256) cho triage items? cache key đúng?
5. **SR-10/badge** — attachBadge qua createElement/textContent? không đụng DOM ngoài owa-adapter (audit CR-C pass)?
6. **Cache** — LRU 500 evict analyzedAt? ghi GỘP batch (giảm ghi)? ERR-08 quota giữ dữ liệu cũ?
7. **Digest UI** — sort giảm dần FR-GD5-04? reason hiển thị? EF-1 trống → hint? badge màu đỏ≥70/cam/xanh?
8. **TD-10/TD-11** — keyset vi===en test có thật? reply EF-5 re-check có decision guard bỏ?
9. **File size + tests chất lượng** — mọi file ≤200 (digest.ts 199 — biên)? +49 tests có test thật (fake timers backoff, progress assert)?

## Verdict: **APPROVED** / **APPROVED with warnings** / **CHANGES REQUESTED** (list cụ thể — KHÔNG tự sửa code)

## Quy tắc
KHÔNG sửa code; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX. Báo cáo: bảng checklist ×9 + verdict + tech debt.