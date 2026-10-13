# Software Test Cases (STC)

## AIMailHelper — AIMH-LOCAL: Trợ lý AI cho Outlook Web (Browser Extension MV3)

> **Ghi chú nguồn (đọc trước):** STC v1 do **QA agent tạo offline** cho placeholder **AIMH-LOCAL** — KHÔNG Jira, KHÔNG DOCX/XLSX. Nguồn: BRD.md v1 (10 US + AC), FSD.md v1.2 (45 FR theo 6 GĐ, BR-01..BR-17, UC-01..09, ERR-01..16, NFR mục 8), TDD.md v1.0 (testing strategy §12, NFR cách đo §10, protocol §6, schema §7). Mỗi case truy vết được về UC/BR/FR/US; test data cụ thể nằm trong `testdata/*.csv`. Định dạng: bảng compact theo 6 test levels (PBT / UT / IT / E2E-API / E2E-UI / SIT) + section Security + NFR.

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | AIMH-LOCAL (placeholder offline — chưa có ticket Jira thật) |
| Title | AIMailHelper — Trợ lý AI cho Outlook Web (Browser Extension MV3) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-14 |
| Status | Draft — chờ SM review + BA review (Phase 4 Step 4b/4b.5) |
| Related STP | documents/AIMH-LOCAL/STP.md (v1.0) |
| Related FSD | documents/AIMH-LOCAL/FSD.md (v1.2 — BA-REVIEWED) |
| Related TDD | documents/AIMH-LOCAL/TDD.md (v1.0) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | QA Agent | Khởi tạo STC v1 — 99 test cases phủ 6 GĐ + Security + NFR; RTM 45 FR + 17 BR + 10 US + 9 UC + 16 ERR = 100%; test data CSV 13 file |

---

## Test Case Summary

| Level | ID Range | Count | Thực thi | Công cụ |
|-------|----------|-------|----------|---------|
| PBT — Property-Based | TC-001..TC-008 | 8 | ✅ Automated | Vitest + fast-check |
| UT — Unit | TC-101..TC-125 | 30 | ✅ Automated | Vitest + jsdom |
| IT — Integration (chrome mock) | TC-201..TC-214 | 21 | ✅ Automated | Vitest + createChromeMock (TDD §12.2) |
| E2E-API — LLM adapter contracts | TC-301..TC-312 | 13 | ✅ Automated | Vitest + fetch + mock HTTP server (SSE fixtures) |
| E2E-UI — Manual trên OWA thật | TC-401..TC-415 | 17 | ❌ Manual (Gherkin) | Browser Chrome/Edge + OWA thật |
| SIT — Visual/UX/timing | TC-501..TC-510 | 10 | ❌ Manual | Browser + DevTools |
| Security-focused (phục vụ P6.3) | TC-601..TC-607 | 7 | ✅ Automated | Vitest (IT/PBT/UT) |
| NFR verification (TDD §10) | TC-610..TC-617 | 8 | 5 Automated + 3 Manual | Vitest + DevTools |
| **Total** | | **99** | **72 Automated (72,7%) / 27 Manual (27,3%)** | |

> Quy ước ID: `TC-` + số 3 chữ số; hàng trăm thể hiện level (1xx UT, 2xx IT, 3xx E2E-API, 4xx E2E-UI, 5xx SIT, 6xx Security/NFR, 0xx PBT). Cột Requirement dùng mã FSD (UC-xx, BR-xx, FR-GDx-xx, ERR-xx, US-xx). Ánh xạ TC-01..TC-14 của FSD mục 11 xem **Appendix A**.

---

## 1. Property-Based Tests — PBT (TC-001..TC-008)

> Property = bất invariant đúng với MỌI input sinh ngẫu nhiên (fast-check `fc.assert(fc.property(...))`, ≥ 100 runs/case). File test: `tests/property/*.test.ts`. Test data fixture: `testdata/email-fixture-testdata.csv`, `testdata/llm-mock-responses-testdata.csv`.

| ID | Test Case | Pri | Type | Requirement | Preconditions | Steps | Test Data | Expected Result |
|----|-----------|-----|------|-------------|---------------|-------|-----------|-----------------|
| TC-001 | serializeEmailData bất biến format | High | Functional | FSD 5.2.0, FR-GD2-01 | fast-check setup; arb EmailData generator (subject/sender/to/cc/bodyText/threadContext/detectedView) | (1) ∀ EmailData → output chứa `SUBJECT:`, `FROM: name <email>`, `BODY:` (2) dòng `CC:` chỉ xuất hiện khi cc ≠ [] (3) khối `THREAD:` chỉ xuất hiện khi detectedView="conversation" (4) không throw với chuỗi Unicode/emoji/newline trong body | email-fixture FIX-01..FIX-10 (seed) | Format khớp mẫu FSD 5.2.0 100% runs; 0 throw |
| TC-002 | toAnalysisResult fail-closed | High | Functional/Security | UC-01 EF-6, FSD 6.6f | fast-check; arb raw string generator (JSON hợp lệ, JSON xen text, markdown fence, chuỗi rỗng, JSON thiếu field) | (1) ∀ raw string → hàm trả AnalysisResult hợp lệ HOẶC null, không bao giờ throw (2) kết quả hợp lệ luôn có importanceScore ∈ [0,100] và importanceLabel khớp score (3) thiếu ≥1 field bắt buộc → null | llm-mock RAW-01..RAW-08 | Fail-closed 100%: không crash panel, không trả kết quả sai schema |
| TC-003 | importanceLabel suy từ score | High | Functional | FR-GD3-06, TDD §7.2 | fast-check; integer 0..100 | (1) score ≥ 70 → "cao" (2) 40 ≤ score < 70 → "trung-binh" (3) score < 40 → "thap" (4) boundary 39/40/69/70 đúng nhãn | sinh toàn miền 0..100 | Mapping đúng 100% giá trị, biên chính xác |
| TC-004 | redactConfig không rò secret | High | Security | BR-08, TDD §8.1 | fast-check; arb string generator + chuỗi giống key (`sk-` + ≥10 ký tự) | (1) ∀ config object chứa secret → redactConfig output KHÔNG chứa secret (2) ∀ error message chứa chuỗi `sk-xxxxx` → sau sanitize chứa `[redacted]` (3) AppError.message + Port error event không chứa secret | security-testdata SEC-01..05 | 0/100+ runs rò secret (BR-08) |
| TC-005 | SSE tolerant parser | High | Functional | FR-GD2-01/05, FSD 5.2.5 | fast-check; arb SSE stream (có/không `[DONE]`, dòng rác, chunk thiếu content, double newline) | (1) ∀ stream → text gộp = tổng các delta hợp lệ, đúng thứ tự (2) không throw khi có dòng không parse được JSON (3) connection close = done khi thiếu `[DONE]` (4) chunk không có `delta.content` được bỏ qua | llm-mock SSE-01..SSE-08 | Parser tolerant đúng 100%, giữ thứ tự chunk |
| TC-006 | LRU cache triage ≤ 500 | High | Functional | BR-09, TDD §7.4 (#10) | fast-check; arb dãy thao tác set/get trên triageCache | (1) ∀ dãy ops → size ≤ 500 (2) entry bị evict luôn là `analyzedAt` cũ nhất (3) key vừa set luôn còn (4) sau get không đổi thứ tự evict | storage-testdata STO-LRU-01 | Invariant LRU đúng 100% dãy thao tác |
| TC-007 | layoutHash bất biến theo cấu trúc | High | Functional | BR-06, FSD 6.6c | fast-check + jsdom; arb DOM mutations (đổi text node, đổi tag/role của 4 vùng probe) | (1) ∀ mutation chỉ đổi NỘI DUNG text (subject/body email) → hash GIỐNG NHAU (2) ∀ mutation đổi cấu trúc (tag/role) của toolbar/list/reading/compose → hash KHÁC (3) hash là sha1 hex ổn định | locator-testdata LOC-HASH-01..03 | Hash chỉ phản ánh cấu trúc — đúng BR-06 100% |
| TC-008 | storage enum gate BR-15 | High | Functional/Security | BR-15, TDD §8.8 | fast-check; arb values cho từng section | (1) ∀ value → setSection chấp nhận ĐÚNG tập hợp lệ: uiLanguage {vi,en}, keyStorage {sync,local}, providerActive (6 ProviderId), replyLanguage {auto,vi,en}, tone {chinh-thuc,than-mat,ngan-gon}, score 0..100 (2) mọi giá trị khác bị từ chối ERR-15 + giữ giá trị cũ | storage-testdata STO-VAL-01..07 | Validate biên đúng 100%, không âm thầm sửa giá trị |

---

## 2. Unit Tests — UT (TC-101..TC-125)

> File test đặt cạnh module (TDD §12.1): `src/shared/llm/adapters/*.test.ts`, `src/content/owa-adapter/*.test.ts`, `src/shared/storage.test.ts`, `tests/br01-audit.test.ts`... Fixture: `testdata/locator-testdata.csv`, `testdata/storage-testdata.csv`, `testdata/automode-testdata.csv`.

| ID | Test Case | Pri | Type | Requirement | Preconditions | Steps | Test Data | Expected Result |
|----|-----------|-----|------|-------------|---------------|-------|-----------|-----------------|
| TC-101 | manifest.config.ts khai báo đúng quyền | High | Functional/Security | FR-GD1-01, BR-16 | Build GĐ1 thành công | (1) đọc `dist/manifest.json` (2) assert host_permissions ⊇ {outlook.office.com/*, outlook.office365.com/*, outlook.live.com/*} (3) assert optional_host_permissions ⊇ {http://localhost/*, http://127.0.0.1/*, https://*/*} (4) assert CSP `script-src 'self'` (5) assert content_scripts.matches = 3 domain OWA (6) assert KHÔNG có quyền `debugger`, KHÔNG host tĩnh ngoài danh sách | provider-config MANIFEST-01 | Manifest khớp bảng chuẩn; không quyền thừa (least-privilege) |
| TC-102 | storage.ts từ chối enum sai (biên cụ thể) | High | Functional | BR-15, FR-GD1-04 | chrome mock sẵn | (1) set uiLanguage="VI" → từ chối ERR-15 (2) uiLanguage="vi " (có space) → từ chối (3) keyStorage="cloud" → từ chối (4) providerActive="chatgpt" → từ chối (5) score=101 → từ chối (6) set đúng "vi"/"local"/"gemini" → chấp nhận | storage-testdata STO-VAL-02 | Giá trị sai bị từ chối + giữ giá trị cũ; đúng được ghi |
| TC-103 | Area routing keyStorage sync↔local | High | Functional | BR-04, FR-GD2-08 | chrome mock; key openai đã lưu ở sync | (1) KEY_STORAGE_SET {keyStorage:"local"} (2) assert chrome.storage.local có `config.providers.openai` (kèm apiKey) (3) assert chrome.storage.sync KHÔNG còn key đó (4) làm ngược lại local→sync (5) CONFIG_GET → hasKey=true | storage-testdata STO-KEY-01 | Không bao giờ tồn tại 2 bản key đồng thời (BR-04) |
| TC-104 | Migration lần đầu + defaults fail-closed | High | Functional | FR-GD6-01, BR-02, BR-03, FSD 6.3.1 | chrome mock rỗng | (1) bắn onInstalled (2) assert storage.schemaVersion=1 (3) assert config.automation.enabled=false (BR-02) (4) assert config.vision.enabled=false (BR-03) (5) assert general defaults {uiLanguage:"vi", keyStorage:"sync", extensionEnabled:true} (6) assert KHÔNG tạo key rỗng cho provider (7) mock schemaVersion=2 (downgrade) → KHÔNG đụng dữ liệu + log cảnh báo | storage-testdata STO-MIG-01..02 | Defaults an toàn đúng; downgrade read-only |
| TC-105 | LRU evict + quota fail giữ dữ liệu cũ | Medium | Functional | ERR-08, TDD §7.4 | chrome mock | (1) set 501 entry triage → size=500, entry evict là analyzedAt cũ nhất (2) mock chrome.storage.local.set reject (quota) khi ghi cache → trả ERR-08, KHÔNG throw xuyên biên, dữ liệu cũ giữ nguyên (3) lặp lại khi ghi config → giữ giá trị cũ, apiKey không mất | storage-testdata STO-QUOTA-01 | ERR-08 đúng hành vi "giữ dữ liệu cũ, không mất key" |
| TC-106 | i18n fallback 3 lớp | Medium | Functional | ERR-13, FR-GD2-09, UC-08 EF-1 | vi.json/en.json bundle | (1) key có ở vi + en → trả đúng bản (2) key thiếu ở vi, có ở en → trả en + không warn (3) key thiếu cả 2 → hiển thị raw key + console.warn 1 lần (4) placeholder {name} có param → render (5) placeholder thiếu param → chuỗi gốc + warn (6) đổi uiLanguage → onLanguageChange notify subscriber | i18n-testdata I18N-01..06 | UI không vỡ khi thiếu key (ERR-13) |
| TC-107 | Registry resolveActive + config snapshot | High | Functional | FR-GD2-01, UC-05 EF-6 | registry khởi tạo | (1) resolveActive với 6 ProviderId lần lượt → đúng instance adapter (id khớp) (2) bắt đầu chat với config A → giữa call đổi providerActive sang B → request đang chạy vẫn dùng config A (snapshot) (3) call mới dùng config B | provider-config PC-REG-01..06 | Adapter map đúng; snapshot không đổi giữa dòng |
| TC-108 | prompts.ts vi/en + serialize | High | Functional | FR-GD2-09, BR-11 | bundle prompts | (1) analyze/reply/triage đều có bản vi + en (2) serializeEmailData khớp format 5.2.0 (TC-001) (3) reply prompt với language="vi"/"en"/"auto" sinh directive đúng ("trả lời bằng tiếng Việt" / English / theo email gốc) (4) uiLanguage="en" + replyLanguage="vi" → prompt reply vẫn bản vi (độc lập — BR-11) | email-fixture FIX-01 | BR-11 được chứng minh ở tầng prompt |
| TC-109 | Selectors T1 trả element + <1ms | High | Functional | FR-GD1-08, FR-GD3-01, NFR TDD §10 | jsdom + fixture DOM OWA (LOC-SEL-01..07) | (1) 7 functionKey (reading-pane, message-toolbar, reply-button, compose-box, inbox-list, inbox-item, send-button) → tryFirst trả element đúng (2) đo console.time quanh tryFirst → < 1ms (3) assert send-button CHỈ được expose cho diagnose, không có API action click | locator-testdata LOC-SEL-01..07 | Chain role → aria-label EN/VN → cấu trúc hoạt động; <1ms |
| TC-110 | A11y tree snapshot ≤20K + filter | High | Functional | FR-GD3-03, TDD §3.1.2 (#4) | jsdom DOM ~5.000 node | (1) snapshot ≤ 20.000 chars; vượt → truncated=true (2) chỉ phát role trong INTERACTIVE_ROLES (16 roles + listitem) + label có nghĩa (3) Ref ID ref_1..ref_n ổn định trong 1 walk (4) element remove → WeakRef deref = null (không giữ cứng) | locator-testdata LOC-TREE-01 | Snapshot giới hạn đúng; Ref ID bền trong phiên |
| TC-111 | layout-hash nội dung ≠ cấu trúc | High | Functional | BR-06 | jsdom fixture 4 vùng probe | (1) đổi subject/body email trong reading pane → hash GIỐNG NHAU (2) thêm node con vào [role=list] → hash ĐỔI (3) đổi role compose box → hash ĐỔI (4) signature 3 cấp gồm tag + role | locator-testdata LOC-HASH-02 | Đúng nguyên tắc "đổi email không vô hiệu cache" (BR-06) |
| TC-112 | Locator cache invariant selector-only | High | Functional | BR-06, TDD §7.2 (#8) | chrome mock; semantic-locator | (1) T2 resolve element KHÔNG suy được structural selector → KHÔNG ghi cache (2) 100 lần ghi cache → scan storage: 100% entry strategy="selector", 0 entry "refId" (3) ghi entry với layoutHash mới → entry hash cũ bị xóa (chỉ giữ hash hiện tại) | locator-testdata LOC-CACHE-01..02 | Invariant #8: persisted entry luôn selector |
| TC-113 | Semantic locator orchestration BR-12 | High | Functional | BR-12, BR-06, FR-GD3-03 | chrome mock + Port mock | (1) T1 hit → trả NGAY, spy cache.get=0 và LLM call=0 (2) T1 miss + cache hit (hash khớp) → querySelector value, LLM call=0 (3) T1 miss + cache miss → build snapshot → LOCATOR_RESOLVE → nhận refId → deref → trả element (4) hash khác → coi như miss (không thử entry stale) | locator-testdata LOC-ORCH-01..04 | Thứ tự T1 → cache → T2 đúng BR-12; 0 token khi cache hit |
| TC-114 | Reader gate BR-14 + EmailData | High | Functional | FR-GD3-02, BR-14 | jsdom fixture email | (1) bodyText rỗng (FIX-03) → trả lỗi ERR-10, spy LLM call = 0 (2) FIX-01 → EmailData đầy đủ 7 field + detectedView (3) bodyText chuẩn hóa: gộp whitespace, giữ xuống dòng đoạn, bỏ tag (4) messageId theo chain S1 attribute → S2 regex AAMk → S3 synthetic hash | email-fixture FIX-01..04 | Gate chặn ở reader — không bao giờ gọi LLM payload rỗng |
| TC-115 | Detector 3 chế độ OWA | High | Functional | FR-GD3-01 | jsdom 3 fixture DOM | (1) fixture reading-pane → "reading-pane" (2) fixture popout → "popout" (3) fixture conversation → "conversation" (4) DOM lạ → "unknown" | locator-testdata LOC-DET-01..04 | Structural probe đúng, không đoán theo text |
| TC-116 | actions.insertDraft React-safe + BR-10 + AF-5 | High | Functional | FR-GD4-03, BR-10, UC-02 AF-5 | jsdom compose box contenteditable | (1) insertDraft("Kính gửi anh Minh...") → dùng native setter/execCommand + dispatch input event (spy bắt event) (2) draft="" → chặn ngay (lớp 2 sau BR-10) (3) compose đã có text "đang viết dở" → trả needs-confirm {replace,append,cancel}, KHÔNG ghi đè im lặng (4) KHÔNG có lệnh click nút Send trong toàn bộ luồng | reply-testdata RPL-INS-01..03 | Điền đúng React-controlled; không đè nội dung người dùng |
| TC-117 | Triage pipeline cache/cap/folder | High | Functional | FR-GD5-01/05/06, BR-07, BR-09 | chrome mock; inbox items fixture | (1) 12 item (10 có messageId, 2 thiếu) → 2 item bỏ qua + log ERR-12, batch không gián đoạn (2) 5 item đã có cache → spy LLM call KHÔNG gồm chúng (BR-09) (3) 60 item → quét 50 (cap), trả thông báo 10 item chờ "Quét tiếp" (4) folderChanged=true trước batch 2 → dừng, giữ kết quả batch 1 (5) KHÔNG tải thêm mail ngoài list hiển thị (BR-07) | triage-testdata TRI-Pipe-01..05 | Đủ 4 hành vi cache/skip/cap/dừng an toàn |
| TC-118 | Triage backoff 429/5xx | Medium | Functional | FR-GD5-02, UC-03 AF-4, ERR-03 | fake timers; mock SW | (1) batch 1 trả 429 + Retry-After: 2 → chờ đúng 2s rồi retry (2) 429 không header → backoff throttleMs 1s→2s→4s (cap 10s) (3) MAX_RETRY_BATCH=3 hết lượt → item "chưa chấm", batch sau vẫn chạy (4) progress {done,total,failed} đúng sau mỗi batch | triage-testdata TRI-Back-01..04 | Backoff + tiến độ đúng 6.6d |
| TC-119 | Auto-mode rule engine + BR-13 | High | Functional | FR-GD6-03, BR-13, FR-GD6-02 | chrome mock; auto-mode module | (1) rules=[] → email mới chỉ được analyze, spy draft call = 0 (2) rule senderPattern "boss@x.com" → chỉ email của boss được draft (3) subjectPattern "invoice" khớp "INVOICE #123" (case-insensitive) (4) minImportance=70: AnalysisResult score 69 → không draft; 70 → draft vào queue pending (5) MutationObserver CHỈ đăng ký khi enabled=true | automode-testdata AM-Rule-01..05 | Rule rỗng → không draft (BR-13); matching đúng |
| TC-120 | Queue status + QUEUE_MAX + tắt giữ nguyên | High | Functional | FR-GD6-04/06, TDD §7.4 | chrome mock; queue.autoDraft | (1) thêm item thứ 201 khi đã 200 pending → KHÔNG thêm + cảnh báo (2) Approve item → status "approved" (3) Reject item → loại khỏi hàng chờ (4) tắt auto-mode → queue.autoDraft GIỮ NGUYÊN, observer hủy, không tự hành động | automode-testdata AM-Queue-01..04 | QUEUE_MAX 200 bảo vệ; FR-GD6-06 đúng |
| TC-121 | BR-01 no-Send source audit | High | Security | BR-01, FR-GD4-04, TDD §8.5 | source tree src/ | (1) scan toàn bộ src/ với regex /click.*send|send.*click|sendButton/i → 0 match (2) assert API surface actions.ts chỉ export {openReplyBox, insertDraft} (3) assert "send-button" CHỈ xuất hiện trong selectors.ts (mục đích diagnose) (4) assert auto-mode.ts/approve flow không chứa hàm click nút nào của OWA ngoài reply-button/compose-box | security-testdata SEC-AUDIT-01 | 0 đường code kích hoạt Send (BR-01 — kiểm chứng lớp 2/4) |
| TC-122 | mapHttpToErr matrix | High | Functional | ERR-01..16, FSD 5.2.0 | sse.ts/util | (1) 401/403 → ERR-02, retryable=false (2) 404/400/413 → ERR-15, retryable=false (3) 429 → ERR-03, retryable=true (pre-first-chunk) (4) 500/503/529 → ERR-16, retryable=true (5) AbortError (timeout) → ERR-04 (6) TypeError fetch → ERR-01 nếu provider cloud, ERR-05 nếu provider local (7) error message mang i18nKey, KHÔNG chứa key | llm-mock ERR-MAP-01..08 | Mapping đúng bảng 5.2.0 cho cả 6 provider |
| TC-123 | validateAnalysisResult schema | High | Functional | FR-GD3-06, FSD 6.6f | util | (1) JSON đủ 7 field + score 0..100 → hợp lệ (2) score=101 / score=-1 → null (3) thiếu actions / intent / sentiment → null (4) deadline = null hợp lệ; deadline = "2026-10-30" hợp lệ (5) importanceLabel không khớp score → null | llm-mock RAW-01..06 | Schema chặt — sai → EF-6 fail-closed |
| TC-124 | PortClient heartbeat + cancel lifecycle | High | Functional | FR-GD2-04, FSD 5.3.1 | fake timers; Port pair fake | (1) stream active → ping 20s/20s đều đặn (2) done → ngừng ping (3) gửi {type:"cancel"} → mọi message trễ của requestId bị CS bỏ qua (4) seq gap (nhận 0,2 thiếu 1) → ghi nhận gaps; done kèm gaps → cảnh báo ERR-07-light | llm-mock PORT-SEQ-01..03 | Heartbeat giữ SW sống; protocol đúng 5.3.1 |
| TC-125 | Vision điều kiện kép BR-03 | High | Security | BR-03, FR-GD4-05, TDD §8.7 | chrome mock + spy captureVisibleTab | (1) vision.enabled=false + T1+T2 fail → spy captureVisibleTab = 0 (2) enabled=true + T1 hit → 0 call (3) enabled=true + T1+T2 fail → đúng 1 call, ảnh nén bề rộng ~1568px JPEG quality ~0.6, buffer ảnh xóa sau call (4) enabled=true + T1 miss + T2 hit → 0 call | reply-testdata RPL-VIS-01..04 | Chỉ chạy khi (T1+T2 fail) VÀ opt-in — kiểm tra kép tại vision-fallback.ts |

