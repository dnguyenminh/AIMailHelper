# DEV Implementation Summary — GĐ5 (AIMH-LOCAL, offline)

> dev-agent, 2026-10-15. Kết quả kiểm chứng (CHẠY THẬT lần cuối 05:27 2026-10-15):
> **npm test 319/319 PASS (47 files; +49 mới vs baseline GĐ4 270)** · typecheck exit 0 ·
> lint exit 0 · vite build exit 0 (chunk `triage` 3.15KB/gzip 1.22KB — tổng gzip vẫn ≤ 1MB).

## Deliverable GĐ5 — files tạo mới

| File | Dòng | Nội dung |
|------|------|----------|
| src/shared/triage.ts | 87 | parseTriageScore/parseTriageScores fail-closed (§8.11 L3): score integer 0..100, **TD-8 reason ≤300 → REJECT**, messageId phải thuộc batch (chống hallucinate id), extractJsonArrayBlock đếm ngoặc tôn trọng chuỗi; TRIAGE_CAPS {reason:300, itemsPerBatch:50} |
| src/content/owa-adapter/triage.ts | 126 | collectInboxItems (BR-07 — duyệt listitem scope TRONG inbox-list, KHÔNG tải thêm mail; S1→S2→S3; ERR-12 log + bỏ qua FR-GD5-06); attachBadge (SR-10 createElement/textContent; đỏ ≥70 / cam 40-69 / xanh <40 — FSD UI spec; thay badge cũ khi quét lại); readFolderSignature/hasFolderChanged (EF-2/EF-4 — identity container + isConnected) |
| src/content/owa-adapter/triage-cache.ts | 74 | cache.triage.{messageId} qua cache-store (Repository BR-15): getTriageMany 1 lần get(null); setTriageMany ghi GỘP batch (§3.3/FSD 5.4.1); LRU 500 evict analyzedAt cũ nhất (§7.4 #10); entry hỏng → dọn (§6.3.2) |
| src/background/handlers/triage.handler.ts | 84 | Port kind "triage-batch" (UC-03 bước 3-4): parse payload BR-15 (1..50 item) → prompt triage uiLanguage + customSystemPrompt + **serializeTriageItems fence §8.11 L2** → adapter.chat temp 0.2 (retry 429 Retry-After / 1-2-4s / 5xx 2-4-8s tái dùng call.ts GĐ2 — pre-first-chunk) → parse fail-closed SW-side → progress {done,total,failed} (§6.2 #7) + chunk scores JSON + done |
| src/content/modules/digest.ts | 176 | TriageController (UC-03/UC-04): cache filter BR-09 → cap triageCap 50 → chunks(batchSize) → runBatchWithRetry → saveScores GỘP + badge + upsertDigest sort giảm dần; EF-2/EF-4 folderChanged TRƯỚC MỖI batch → break giữ kết quả; scanMore (AF-5 keepDigest) / rescan (AF-2 force) / cancel |
| src/content/modules/digest-batch.ts | 101 | runBatchWithRetry (6.6d inner loop): MAX_RETRY_BATCH 3, backoff throttleMs→×2 cap 10s (MAX_BACKOFF_MS), retryable CHỈ ERR-03/ERR-16; cancel() resolves ngay (PortClient bỏ event sau cancel — race pattern); attemptOnce gom chunk → parseTriageScores |
| src/content/modules/digest-helpers.ts | 61 | pure: chunks / entriesFromCached / upsertDigest (sort FR-GD5-04) / toTriageError (BR-08) / progressOf |
| src/content/modules/digest-types.ts | 43 | TriageUiState/Deps/Error/Progress/DigestEntry — types tách để giữ file ≤200 |
| src/content/components/Panel/DigestView.tsx | 91 | UC-04 UI: nút Triage + progress {done}/{total} + Dừng; **EF-1 trống → hướng dẫn "Chạy Triage inbox trước" + nút UC-03**; EF-5 overflow → "Quét tiếp"; EF-3 failedNote; EF-2 folderStopped note; BR-09 cachedNote; badge màu + subject + **reason** (FR-GD5-04); AF-2 "Quét lại (bỏ cache)" |
| src/content/modules/digest-testkit.ts / reply-testkit.ts | 88/58 | test harness dùng chung (TDD §12.1 — DI fake deps) |

## Files sửa

| File | Thay đổi |
|------|----------|
| src/shared/types.ts | +TriageItem (messageId/subject/sender/snippet — khớp payload §4.2) |
| src/shared/messaging.ts | items → TriageItem[] (single source) |
| src/shared/cache-store.ts | +getCacheAll(prefix) 1 lần get(null); +setCacheMany ghi gộp |
| src/shared/llm/prompts.ts | +serializeTriageItems — fence EMAIL_OPEN/CLOSE + neutralize từng trường (§8.11 L2) |
| src/content/owa-adapter/owa-adapter.ts | collectInboxItems/attachBadge/readFolderSignature/hasFolderChanged THẬT (bỏ notImplementedError GĐ5); locate triage KHÔNG opt-in vision (BR-03) |
| src/background/service-worker.ts | registerTriageHandlers(streamServer) |
| src/content/components/Panel/Panel.tsx | +TriageController + DigestView wiring (onStart/scanMore/rescan/stop) |
| src/content/components/shadow-root.ts | +CSS .aimh-digest/.aimh-digest-list |
| src/shared/i18n/vi.json · en.json | **+12 keys panel.triage.\*** — keyset 168=168 parity |
| src/shared/i18n/index.ts | I18N_DICTIONARY_SIZE 156→168 |
| src/content/modules/reply.ts | **TD-11**: guard EF-5 bỏ điều kiện `decision === undefined` → re-check CẢ lần chèn có decision |
| documents/AIMH-LOCAL/OWA-DOM-SPIKE.md | **+7 probes triage (#39–45)**: scope listitem trong list, subject/sender probe trong row, S1 trên listitem, badge inject layout, folder-switch container identity, virtualized scroll badge; 38→45 dòng, mọi dòng UNVERIFIED |
| documents/AIMH-LOCAL/STATUS.json · RUN-LOG.md | gd5 result + entry #64 |

## Test mới GĐ5 (+49; baseline 270 GĐ4)

| File | Số test | Phủ |
|------|---------|-----|
| src/shared/triage.test.ts | 10 | §8.11 L3: score biên 101/-1/85.5, **TD-8 reason 300 OK/301 REJECT**, messageId hallucinate, mảng bọc text, analyzedAt freshness |
| src/content/owa-adapter/triage.test.ts | 8 | **BR-07** scope trong list (listitem ngoài list không quét); S1/S2/S3 (synthetic SHA-256 trunc 16 — SR-09); ERR-12 bỏ qua + log; badge createElement/textContent + màu 3 bands + aria-label + thay badge; folder guard đổi container/disconnect (EF-2/EF-4) |
| src/content/owa-adapter/triage-cache.test.ts | 4 | BR-09 roundtrip; ghi GỘP 1 lần set; **LRU 502→500 evict analyzedAt cũ nhất**; entry hỏng dọn |
| tests/llm/triage.handler.test.ts | 4 | IT Port thật: accepted→progress→chunk→done; temp 0.2 + prompt triage + fence; **TD-8 progress.failed=1 + chunk chỉ còn score hợp lệ**; ERR-15 payload sai; ERR-11 chưa cấu hình; ERR-02 401 không lộ key (BR-08) |
| src/content/modules/digest.test.ts | 8 | **TC-118: batch 3+3+3+1**; throttle giữa batch; **BR-09 0 LLM cho cached + AF-1 badge/Digest**; cap 50 overflow (EF-5); AF-5 scanMore chỉ item mới; AF-2 rescan; TD-8 mức controller (failed+=reject không gián đoạn); Digest sort FR-GD5-04 |
| src/content/modules/digest-retry.test.ts | 7 | **429 → MAX_RETRY_BATCH 3 + backoff 1000→2000**; hết lượt → batch sau vẫn chạy (EF-3); ERR-15 non-retryable không backoff; **cap backoff 10s**; folder đổi trước batch 2 → dừng giữ kết quả; ERR-06; user cancel |
| src/content/components/Panel/DigestView.test.tsx | 4 | **EF-1 trống → hint + nút UC-03**; sort hiển thị + badge màu 3 bands + reason; EF-5 overflow + Quét tiếp + failed/folder/cached notes; running progress label |
| src/shared/i18n/i18n.test.ts | +1 | **TD-10: keyset vi.json === en.json (Object.keys)** + đọc disk + size 168 |
| src/content/modules/reply-insert.test.ts | +1 | **TD-11: insert CÓ decision vẫn re-check EF-5 → mismatch KHÔNG chèn** |
| tests/llm/call.test.ts | +3 | **429 Retry-After:2 → chờ đúng 2000ms**; 429 không header → 1s→2s→4s rồi ERR-03; 5xx → 2s→4s→8s rồi ERR-16 (fake timers — §9.2) |
| Tách file (≤200 — audit GĐ1 #5) | — | reply.test.ts → reply.test.ts + reply-insert.test.ts (+reply-testkit.ts); digest.test.ts → digest.test.ts + digest-retry.test.ts (+digest-testkit.ts) — 0 test mất, hành vi giữ nguyên |

## Chứng cứ ràng buộc

- **BR-07** (chỉ quét list đang hiển thị): triage.ts duyệt `list.querySelectorAll(listitem)` — test "BR-07: CHỈ duyệt item trong inbox-list" (listitem ngoài list không bị quét); KHÔNG có fetch/pagination nào trong triage path.
- **BR-09** (cache hit không gọi LLM): digest.ts filter `!cached.has(id)` trước chia batch — test "BR-09 0 LLM cho cached" assert `requested === ["b","c"]` với a cached; handler-level test khẳng định items gửi đi CHỈ gồm item chưa cache.
- **TD-8** (reason ≤300): `TRIAGE_CAPS.reason = 300` — REJECT ở parseTriageScore (shared, dùng cả SW + CS); test: shared/triage.test.ts (301 → null), tests/llm/triage.handler.test.ts (progress.failed=1), digest.test.ts (failed+=1 không gián đoạn).
- **EF-1 UC-04** (Digest trống): DigestView `empty` state → `panel.triage.empty` + nút `panel.triage.emptyAction` — test DigestView.test.tsx case 1.
- **EF-2/EF-4** (đổi folder giữa chừng): folderChanged TRƯỚC MỖI batch (6.6d) → break giữ kết quả — test "folder đổi trước batch 2 → dừng giữ kết quả batch 1, folderStopped=true".
- **EF-5 UC-03** (cap 50 + Quét tiếp): overflow = todo.length − triageCap → DigestView nút "Quét tiếp" → scanMore (keepDigest) chỉ quét item chưa cache — test cap 50 (60 item → 50 + overflow 10) + scanMore.
- **AF-5** (virtualized list): chỉ item trong DOM được quét (BR-07); scanMore giữ digest cũ + chỉ request item mới (test).
- **BR-01/SR-10/CR-C**: audit test PASS — 0 innerHTML, 0 send-click pattern, DOM API chỉ trong biên cho phép (triage badge nằm trong owa-adapter/**), file ≤200 dòng toàn src/.
- **D1 (không sửa code)**: analyze không dùng T3 kể cả khi vision enabled — đúng hiện trạng (`readEmail` → locate allowVision=false → VisionFallback chặn per-call). KHÔNG mở opt-in analyze — chờ SA ghi FSD AF-3 amendment.

## Deviations khai báo (cho TA review)

1. **SW parse trước khi gửi về CS** (triage.handler parseTriageScores + progress + chunk scores-JSON thay vì stream raw LLM): L3 fail-closed ở SW, progress per-batch qua Port đúng §6.2 #7; digest vẫn re-validate bằng cùng parser (defense-in-depth).
2. **Throttle chỉ GIỮA các batch** (không sleep sau batch cuối — 6.6d pseudocode ngủ cả vòng cuối): tối ưu 1s vô nghĩa cuối quét; mọi test/pseudocode-flow khác giữ nguyên.
3. **folder signature = container identity + isConnected** (TDD cho phép "MutationObserver lightweight HOẶC check giữa batch"): container-reuse là điểm mù — probe #44 ghi trong OWA-DOM-SPIKE để verify; nếu reuse thật sẽ bổ sung signal ở batch fix sau UAT.
4. **Badge có thể mất khi OWA re-render row** (virtualized): đúng §3.1.6 "không cache DOM element qua phiên" — quét lại gắn lại; probe #45 verify.
5. **Tách 2 file test** (reply/digest >200 dòng sau khi thêm test): 0 test thay đổi hành vi, đúng audit GĐ1 #5.

## Hạn chế (báo cáo rõ)

1. **Spike OWA thật (45 probes) deferred-to-UAT** — code GĐ5 không phụ thuộc kết quả spike (DECISION #63); S1/S2/S3 + folder signature cần verify thật ở UAT gate.
2. Progress per-batch từ SW là {done,total,failed} của batch đó — tổng cộng dồn do digest tính (đúng pseudocode 6.6d); PortEvent không mang tổng tích lũy cross-request.
3. LLM batch output > maxTokens 2048 (batch 50 item, reason dài) có thể cắt JSON → batch đó 0 score hợp lệ → "chưa chấm" + retry hết lượt → EF-3; thực tế batch 5-10 item an toàn (mặc định 5).
4. saveScores ERR-08 (quota) hiện surf qua scan.lastError (panel hiển thị message) — chưa có nút "dọn cache" riêng (EF-4 UC-03 chi tiết UI để GĐ6/UAT).
