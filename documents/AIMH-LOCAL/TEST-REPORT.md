# Test Execution Report — AIMH-LOCAL (P6 Testing)

## AIMailHelper — Trợ lý AI cho Outlook Web (Browser Extension MV3)

> Báo cáo thực thi test **Phase 6** — chạy offline, KHÔNG Jira, KHÔNG DOCX/Mermaid. Mọi kết quả là
> số liệu **chạy thật** trên máy dev (Windows, ngày 2026-10-15). Manual OWA (E2E-UI/SIT) gom vào
> `UAT-CHECKLIST.md` theo **DECISION #63** (RUN-LOG).

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | AIMH-LOCAL (placeholder offline) |
| Phase | P6 — Testing |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-15 |
| Input | STP.md v1.0, STC.md v1.1 (99 TCs), TDD.md v1.1, RUN-LOG.md (#62–#76) |
| Execution log | TEST-REPORT-AIMH-LOCAL.csv (99 dòng, Status RUN thật) |
| UAT gate | UAT-CHECKLIST.md (file DUY NHẤT cho user test trên OWA thật) |

---

## 1. Kết quả 4 lệnh verification (chạy thật 2026-10-15)

| # | Lệnh | Kết quả | Chi tiết |
|---|------|---------|----------|
| 1 | `npm test` | ✅ **PASS** | **54 test files, 366/366 tests passed** (lần đầu: 52 files / 352/352; +14 tests sau khi vá 2 gap Critical — xem §4) |
| 2 | `npm run typecheck` | ✅ **PASS** | `tsc --noEmit` exit 0 — 0 error (sau khi vá: 2 lỗi type ở test mới đã fix) |
| 3 | `npm run lint` | ✅ **PASS** | `eslint src tests` exit 0 — 0 error 0 warning (sau khi vá: 2 lỗi unused-vars đã fix) |
| 4 | `npm run build` | ✅ **PASS** | `vite build` exit 0 — 126 modules, 17 assets; lớn nhất 163.75 KB (gzip 52.55 KB); **tổng gzip ≈ 95 KB << 1 MB** (TC-616); 1 warning vô hại (dynamic+static import owa-adapter) |

**Không có test nào FAIL, không có blocked.**

---

## 2. Tổng hợp thực thi 99 STC Test Cases

| Trạng thái | Số TC | Tỷ lệ | Ghi chú |
|------------|-------|-------|---------|
| **PASS** (automated) | **56** | 56.6% | Evidence = tên test thật (xem CSV cột Actual_Result) |
| **PASS-PARTIAL** (automated) | **15** | 15.2% | Chức năng chính PASS; 1 khía cạnh phụ chưa assert (timing/jsdom/garbage-input) — chi tiết §4 |
| **NOT_RUN** (gap automated) | **1** | 1.0% | TC-212 GET_RUNTIME_STATE — 0 test tự động (gap Medium) |
| **DEFERRED-TO-UAT** (manual) | **27** | 27.3% | TC-401..415, TC-501..510, TC-613, TC-614 — theo DECISION #63 |
| **Total** | **99** | 100% | STC v1.1 |
| **FAIL / BLOCKED** | **0** | 0% | — |

**Automated thực thi: 72/72 TC automated đã chạy** (56 PASS + 15 PASS-PARTIAL + 1 NOT_RUN-gap).

### Suite thật sau P6 (so với trước P6)

| Metric | Trước P6 (RUN-LOG #70) | Sau P6 | Δ |
|--------|------------------------|--------|---|
| Test files | 52 | **54** | +2 (port-client.test.ts; manifest.test.ts) |
| Tests | 352 | **366** | **+14** (7 PortClient + 7 Manifest) |
| Typecheck / Lint / Build | 0/0/0 | **0/0/0** | giữ xanh |

---

## 3. RTM Coverage (97 requirements)

### 3.1 Coverage tự động (chỉ tính test thật đã chạy)

| Nhóm | Tổng | Có test tự động | Tự động % | Chỉ manual (UAT) |
|------|------|-----------------|-----------|------------------|
| FR-GD1..GD6 (45) | 45 | 37 | 82.2% | 8 (FR-GD1-02/03/07, FR-GD3-05, FR-GD4-01/02/06/08) |
| BR-01..17 (17) | 17 | **17** | **100%** | 0 |
| ERR-01..16 (16) | 16 | 16 | 100% (15 full + ERR-01 partial) | 0 |
| US-01..10 (10) | 10 | 9 | 90% | 1 (US-07 — reply chèn là safety-critical, bắt buộc mắt người) |
| UC-01..09 (9) | 9 | 8 | 88.9% | 1 (UC-09 Diagnose) |
| **Tổng (97)** | **97** | **87** | **89.7%** | 10 |

### 3.2 Coverage tổng (kể cả UAT manual theo kế hoạch STC)

| Nhóm | Covered | Coverage % |
|------|---------|------------|
| Toàn bộ 97 requirements | 97/97 | **100%** (khi UAT-CHECKLIST được thực thi đầy đủ) |

**Kết luận:** 10 requirements chỉ có test manual đều là **visual/UX/safety trên OWA thật** (layout Shadow DOM,
inject 3 domain, reply chèn + BR-01 quan sát, Diagnose report) — đúng thiết kế STC v1.1, không phải lỗ hổng
thiết kế. Điều kiện: UAT-CHECKLIST phải PASS hết thì RTM tổng mới đóng 100%.

---

## 4. Findings — Test Gap Analysis

### 4.1 Gap CRITICAL — ĐÃ VÁ trong P6 (được phép viết test, không đụng code production)

| # | Gap | TC liên quan | Mô tả | Hành động P6 | Kết quả |
|---|-----|--------------|-------|--------------|---------|
| C1 | `src/shared/port-client.ts` (112 dòng) **0 test trực tiếp** | TC-124, TC-208 (High) | Heartbeat 20s, seq-gap ERR-07-light, reconnect pre-first-chunk 1x, ERR-07 post-chunk giữ phần đã nhận — chỉ được IT phủ happy-path qua handlers; các nhánh lỗi/safety chưa từng chạy | Tạo `src/shared/port-client.test.ts` — 7 tests (fake timers + port pair mock, theo pattern stream.handler.test.ts) | ✅ **7/7 PASS** — heartbeat ping 20s/20s; done ngừng ping; cancel bỏ qua message trễ; gap → ERR-07-light; late-after-done bỏ qua; reconnect 1x nguyên văn; post-chunk ERR-07 giữ 2 chunk không nhân đôi |
| C2 | **Manifest MV3 0 test** (quyền/CSP) | TC-101, TC-606 (High/Security) | Bề mặt quyền (SR-12 least-privilege, BR-05 host, BR-16 CSP) không có test nào — thêm quyền thừa hay mở CSP không làm fail test nào | Tạo `tests/manifest.test.ts` — 7 tests (`@vitest-environment node`, đọc manifest.config.ts + guard dist/manifest.json) | ✅ **7/7 PASS** — permissions chỉ `storage`; host = 3 OWA + 4 cloud; optional ⊇ localhost; CSP `script-src 'self'` không nguồn xa; MV3 SW module; dist khớp config |

### 4.2 Gap HIGH — chưa vá (khuyến nghị batch tiếp theo)

| # | Gap | TC liên quan | Mô tả | Đề xuất |
|---|-----|--------------|-------|---------|
| H1 | Static fetch audit thiếu | TC-605 | Chưa có scan "mọi `fetch()` chỉ nằm trong `background/`" (dynamic đã phủ qua handlers: ERR-14 gate + analyze chỉ gọi provider active) | Thêm 1 it() vào tests/audit.test.ts (≤ 15 dòng) |
| H2 | Migration-step-throw chưa test trực tiếp | TC-213 | Chưa có case mock 1 bước MIGRATIONS throw → chuỗi dừng, dữ liệu cũ + apiKey còn, idempotent (idempotent/downgrade/ERR-08 đã test) | Thêm vào src/shared/storage.test.ts |

### 4.3 Gap MEDIUM — chưa vá

| # | Gap | TC liên quan | Mô tả | Đề xuất |
|---|-----|--------------|-------|---------|
| M1 | GET_RUNTIME_STATE 0 test | TC-212 | `state.handler.ts` chưa có test tự động; popup chỉ verify UAT (TC-402) | Tạo tests/llm/state.handler.test.ts (≤ 60 dòng) |
| M2 | XSS render động thiếu | TC-603 | Chỉ có static audit SR-10 (0 dangerouslySetInnerHTML/.innerHTML) — chưa render FIX-06 vào panel để assert escaped runtime | Thêm render test vào DigestView/Panel test |
| M3 | ERR-01 nhánh cloud chưa assert | TC-122 | TypeError → ERR-01 (CORS, provider cloud) chưa test trực tiếp (local → ERR-05 đã có; errmap dùng chung) | Thêm 1 case vào openai.test.ts |
| M4 | NFR timing không đo trong jsdom | TC-109/610/611/612/615/617 | `<1ms` T1, `<10ms` cache, `≤100ms` snapshot, `p95<10ms`, `≤15s wall-clock` — chức năng PASS, số đo timing không assert được đáng tin trong jsdom | Đo trên OWA thật trong UAT (DevTools) + benchmark node riêng nếu cần |
| M5 | PBT approach ADJUSTED | TC-001..008 | STC định nghĩa fast-check (property-based); **fast-check không có trong devDependencies** — 8 TC chạy example-based tương đương invariant (cùng kết luận, ít robust hơn với input ngẫu nhiên) | Nếu muốn đúng STC: thêm fast-check + viết 8 property test; hoặc cập nhật STC ghi nhận deviation |

### 4.4 Gap LOW (ghi nhận, không chặn)

- TC-205: case listModels trả HTML rác → `models=[]` chưa explicit (2 shape hợp lệ đã test).
- TC-311: message EF-4 (429 lúc Test Connection — "key có thể hợp lệ") chưa assert riêng; testConnection nằm ở base-adapter dùng chung 6 provider.
- TC-312: loop riêng từng adapter chưa lặp — errmap dùng chung (openai + redact.test + connection.handler đã phủ cơ chế).
- TC-214: assert `permissions.request({origins:[origin vừa nhập]})` đúng origin chưa explicit (ERR-14 gate đã test).
- TC-204 ADJUSTED: thiếu trường bắt buộc → code trả **ERR-15** (validate biên §8.8) thay vì ERR-11 như STC mô tả — hành vi fail-closed tương đương; khuyến nghị sync 1 dòng ở FSD/STC.
- TC-616: đo bundle thủ công từ build log (không phải automated test) — PASS rõ ràng (≈95KB gzip).

---

## 5. Môi trường thực thi

```text
Runner    : Vitest 2.1.9 (run mode) — 54 files
Env       : jsdom 25 (default) + node (manifest.test.ts — pragma @vitest-environment node)
Mocks     : tests/mocks/chrome.ts createChromeMock (MessageRouter thật, port pair duplex, permissions);
            fetch mock SSE fixtures (tests/llm/helpers.ts) — 0 token LLM trong toàn bộ automation
Timers    : vi.useFakeTimers cho heartbeat/backoff/timeout
Build     : Vite 5.4.21 + @crxjs 2.7.1 — dist/ MV3
OS        : Windows (pwsh) — 2026-10-15
Evidence  : documents/AIMH-LOCAL/TEST-REPORT-AIMH-LOCAL.csv (cột Actual_Result = tên test thật)
```

---

## 6. Kết luận & Khuyến nghị

1. **Gate P6 automated: PASS** — 366/366 tests, typecheck/lint/build xanh, 0 FAIL, 0 blocked.
2. **2 gap Critical đã vá** (PortClient protocol safety + Manifest least-privilege) — +14 tests, không đụng code production.
3. **Chưa đóng UAT GATE**: 27 TC manual (45 probe DOM + luồng chính GĐ1-6 + 25 TC rút gọn + TD-G5-2 + TD-G6-4)
   chờ user thực thi theo `UAT-CHECKLIST.md`. BR-01 (no-Send) và auto-mode (BR-02/BR-13) **bắt buộc** xác thực
   bằng mắt trên OWA thật trước khi Release.
4. **Batch đề xuất sau UAT** (không chặn): H1 fetch-audit, H2 migration-throw, M1 state.handler, M2 XSS render,
   M3 ERR-01 cloud; quyết định M5 (fast-check hay ghi nhận deviation).
5. Discrepancy tài liệu 1 dòng: ERR-11 vs ERR-15 ở TEST_CONNECTION thiếu trường (TC-204) — cho BA sync FSD/STC.

---

## Appendix A — Lịch sử chạy lại (re-test)

| Lần | Thời điểm | Suite | Kết quả | Ghi chú |
|-----|-----------|-------|---------|---------|
| 0 | 2026-10-15 06:54 | 52 files / 352 tests | ✅ 352/352 | Baseline RUN-LOG #70 (dev-agent GĐ6) tái lập |
| 1 | 2026-10-15 07:06 | + port-client.test.ts | ✅ 7/7 (file mới) | Vá gap C1 — heartbeat/reconnect/ERR-07 |
| 2 | 2026-10-15 07:06 | + manifest.test.ts | ❌ 1 suite lỗi | jsdom phá invariant esbuild khi import @crxjs → fix `@vitest-environment node` |
| 3 | 2026-10-15 07:07 | 54 files / 366 tests | ❌ typecheck 2 lỗi + lint 2 lỗi | ManifestV3Export là Promise-typed; unused imports → fix type cast + xóa import thừa |
| 4 | 2026-10-15 07:08 | **54 files / 366 tests** | ✅ **366/366 + typecheck 0 + lint 0** | **Trạng thái cuối — PASS** |

> Quy tắc tuân thủ: KHÔNG sửa code production (chỉ thêm 2 file test); file mới ≤ 200 dòng
> (port-client.test.ts 163 dòng; manifest.test.ts 79 dòng — audit test tự kiểm tra vẫn PASS).
