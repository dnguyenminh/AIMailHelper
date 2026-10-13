
---

## 5. E2E-UI — Manual trên OWA thật (TC-401..TC-415)

> Thực thi **thủ công trên OWA thật** (mốc bắt buộc sau GĐ4 trên CẢ outlook.office.com VÀ outlook.live.com — FR-GD4-08). Viết dạng **Gherkin** để tái lập được; người thực thi: QA/SM. LLM ưu tiên **Ollama local** (0-cost, env `OLLAMA_ORIGINS=chrome-extension://*`); cloud key chỉ smoke ngắn. Bằng chứng: screenshot lưu `evidence/TC-xxx-*.png`; kết quả ghi `TEST-REPORT-AIMH-LOCAL.csv`. Test data: `testdata/ui-owa-testdata.csv`.

### TC-401: Load unpacked trên Chrome + Edge (FSD TC-01)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-01 AC1, FR-GD1-01 |
| Preconditions | Build GĐ1 trong `dist/`; Chrome ≥114 + Edge ≥114 |

```gherkin
Scenario: Extension load được qua Load unpacked không lỗi
  Given thư mục build dist/ của GĐ tương ứng
  When tôi nạp extension bằng "Load unpacked" trên Chrome
  Then extension xuất hiện trong chrome://extensions ở trạng thái enabled, không error
  When lặp lại trên Edge (edge://extensions)
  Then kết quả tương tự — không có lỗi console liên quan extension
```

**Postconditions:** extension sẵn sàng; ghi screenshot chrome://extensions + console trống.

### TC-402: Popup trạng thái + config persist

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-01 AC2/AC5, FR-GD1-02 |
| Preconditions | TC-401 PASS; đã cấu hình 1 provider |

```gherkin
Scenario: Popup hiển thị đúng và config bền sau restart
  Given extension đã load, provider active = "openai"
  When mở popup
  Then hiển thị provider status "openai", toggle bật/tắt extension, nút mở Options
  When bật/tắt toggle rồi đóng — mở lại popup
  Then trạng thái giữ đúng giá trị vừa chọn
  When đóng hoàn toàn trình duyệt và mở lại
  Then config (provider, toggle, uiLanguage) đọc lại đúng từ chrome.storage (US-01 AC5)
```

### TC-403: Options shell render + content script inject 3 domain

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-01 AC3/AC4, FR-GD1-03/07 |
| Preconditions | TC-401 PASS; đăng nhập OWA work + personal |

```gherkin
Scenario: Options render và content script inject đúng domain
  Given extension đã load
  When mở trang Options (từ popup)
  Then Options render shell React với đủ 6 section (ProviderForm, ModelPicker, TestConnection, PromptSettings, AutomationSettings, GeneralSettings)
  When mở outlook.office.com, outlook.office365.com, outlook.live.com lần lượt
  Then content script inject thành công trên CẢ 3 domain (nút extension xuất hiện, console không lỗi)
  When mở 1 domain ngoài danh sách (vd gmail.com)
  Then content script KHÔNG inject (đúng host_permissions)
```

### TC-404: Chat test streaming đủ 6 provider (FSD TC-02)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-02 AC2, FR-GD2-05/07 |
| Preconditions | Options mở; Ollama chạy (đã pull llama3.2); 1 cloud key smoke (tùy) |

```gherkin
Scenario: Chat test streaming thành công cho đủ 6 provider
  Given Options → ProviderForm
  When cấu hình lần lượt 6 provider (openai, azure, anthropic, gemini, openai-compatible, local-ollama) với testdata/provider-config-testdata.csv
  And bấm "Chat test" cho từng provider
  Then kết quả streaming hiển thị trong Options cho TẤT CẢ provider cấu hình đúng (US-02 AC2)
  When chọn Local Ollama nhưng CHƯA đặt env OLLAMA_ORIGINS
  Then hiển thị ERR-05 kèm hướng dẫn đặt OLLAMA_ORIGINS=chrome-extension://* và kiểm tra port 11434 (FR-GD2-07)
```

### TC-405: Test Connection hiển thị latency + lỗi rõ (FSD TC-03)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-03 AC1..3, FR-GD2-06, BR-08 |
| Preconditions | Provider đã cấu hình |

```gherkin
Scenario: Test Connection trả ok/message/latencyMs
  Given provider active cấu hình đúng (Ollama local)
  When bấm "Kiểm tra kết nối"
  Then result area hiển thị màu XANH, message "OK (200)", latencyMs là số đo được (>0), nút disable trong lúc gọi
  When đổi key thành key sai rồi test lại (cloud provider)
  Then result màu ĐỎ, message lỗi rõ ràng, KHÔNG thấy giá trị key ở bất kỳ đâu (BR-08)
  When bấm test khi còn thiếu trường bắt buộc
  Then chặn ngay với thông báo "Còn thiếu: {danh sách trường}" — không gọi API (ERR-11)
```

### TC-406: ModelPicker fetch + nhập tay (BR-17)

| Attribute | Value |
|-----------|-------|
| Priority / Type | Medium · Functional E2E |
| Requirement | US-02 AC3/AC4, FR-GD2-03, BR-17 |
| Preconditions | Options mở; provider openai/azure/compatible |

```gherkin
Scenario: ModelPicker fetch khi hỗ trợ, nhập tay luôn khả dụng
  Given ProviderForm openai có key hợp lệ
  When bấm fetch models
  Then dropdown hiện danh sách model từ API; ô nhập tay VẪN khả dụng (BR-17)
  When chuyển sang Azure
  Then nút fetch BỊ ẨN, chỉ cho nhập tay endpoint + deployment + api-version (US-02 AC4)
  When fetch models lỗi (mock ngắt mạng)
  Then hiện "Không lấy được danh sách — nhập tay"; LƯU cấu hình vẫn thành công (lỗi fetch không chặn lưu — BR-17)
```

### TC-407: i18n vi/en toàn UI (FSD TC-05)

| Attribute | Value |
|-----------|-------|
| Priority / Type | Medium · Functional E2E |
| Requirement | US-05 AC1..3, FR-GD2-09, BR-04 (privacy note) |
| Preconditions | Options mở |

```gherkin
Scenario: Đổi ngôn ngữ cập nhật toàn bộ UI
  Given GeneralSettings → UI language = "vi"
  When đổi sang "en"
  Then popup + panel + Options cập nhật tiếng Anh NGAY (US-05 AC1)
  When kiểm tra GeneralSettings
  Then privacy note hiển thị đúng ngôn ngữ mới, giải thích nơi lưu key + phạm vi gửi dữ liệu (FR-GD2-08)
  When inject key i18n lạ (fixture dev) rồi render lại
  Then fallback về English; nếu vẫn thiếu → raw key + console.warn, UI KHÔNG vỡ (ERR-13)
  And ngôn ngữ trả lời AI (PromptSettings) là setting riêng — không đổi theo uiLanguage (BR-11)
```

### TC-408: Analyze email — streaming 5 khía cạnh + badge (FSD TC-06)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-06 AC1/AC2/AC3, FR-GD3-04..07, BR-14 |
| Preconditions | TC-401..404 PASS; provider hoạt động; mở email FIX-01 trên OWA |

```gherkin
Scenario: Phân tích email streaming trả đủ 5 khía cạnh
  Given email FIX-01 (có deadline 2026-10-30) đang mở trong reading pane
  When bấm nút "AI phân tích" được inject vào toolbar email
  Then panel AI (Shadow DOM) hiển thị streaming trong vài giây (US-06 AC1)
  And khi done: đủ 5 khía cạnh — tóm tắt, độ quan trọng (score + nhãn badge MÀU), ý định & hành động, deadline, cảm xúc (US-06 AC2)
  And nút "Soạn trả lời" xuất hiện sau khi có kết quả
  When mở email rỗng (FIX-03) rồi bấm phân tích
  Then hiển thị "Không đọc được nội dung email" (ERR-10) — KHÔNG có LLM call nào (BR-14)
```

### TC-409: Self-healing T1 gãy → T2 phục hồi (FSD TC-07)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-06 AC4, FR-GD3-03, BR-06, BR-12 |
| Preconditions | TC-408 PASS; DevTools mở trên trang OWA |

```gherkin
Scenario: T1 gãy thì T2 tự định vị, cache theo layoutHash
  Given email đang mở, analyze đã chạy thành công 1 lần qua T1
  When dùng DevTools xóa/đổi attribute aria-label mà selectors T1 phụ thuộc (mô phỏng MS đổi UI)
  And bấm "AI phân tích" lại
  Then T2 semantic locator chạy (log tier "T2" — console/session), định vị được vùng đọc và analyze thành công mà KHÔNG cần update extension (US-06 AC4)
  When reload trang rồi phân tích lại
  Then log tier = "cache" — cache hit theo layoutHash, KHÔNG tốn token (BR-06)
  And kiểm tra chưa từng chạy T3 khi vision TẮT (BR-12)
```

### TC-410: Reply — chèn compose box, KHÔNG tự Send (FSD TC-08)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional/SAFETY E2E |
| Requirement | US-07 AC1..4, FR-GD4-01..04, BR-01, BR-11 |
| Preconditions | TC-408 PASS (panel có kết quả); email FIX-01 đang mở |

```gherkin
Scenario: Sinh draft → chèn vào Reply → người dùng tự Send
  Given panel có kết quả phân tích email FIX-01
  When bấm "Soạn trả lời", chọn tone "chính thức", ngôn ngữ "VI", gõ extraInstructions "Nhắc lại lịch họp thứ 3"
  Then draft preview hiển thị streaming; khi done nút "Chèn vào Reply" bật
  When bấm "Chèn vào Reply"
  Then compose box Reply của OWA được mở (nếu chưa) và chứa nội dung draft (US-07 AC1)
  And panel KHÔNG có bất kỳ nút Send nào của extension; KHÔNG có click event nào lên nút Send của OWA (US-07 AC4, BR-01)
  When người dùng tự sửa draft rồi bấm Send CỦA OWA
  Then email gửi bình thường — hoạt động hoàn toàn bằng thao tác người dùng (US-07 AC2)
  And khi uiLanguage=en nhưng ngôn ngữ chọn "VI" → draft tiếng Việt (replyLanguage độc lập uiLanguage — BR-11)
```

### TC-411: Draft rỗng vô hiệu nút + AF-5 compose có sẵn nội dung (FSD TC-09)

| Attribute | Value |
|-----------|-------|
| Priority / Type | Medium · Functional E2E |
| Requirement | BR-10, FR-GD4-07, UC-02 AF-5 |
| Preconditions | Panel mở; compose box OWA có thể có nội dung sẵn |

```gherkin
Scenario: Draft rỗng và compose có nội dung sẵn
  Given mock stream trả draft rỗng (fixture)
  When stream done
  Then nút "Chèn vào Reply" DISABLED (BR-10)
  Given compose box OWA đang có text "hộp nháp đang viết dở"
  When sinh draft mới và bấm "Chèn vào Reply"
  Then panel HỎI xác nhận (thay thế / ghép thêm / hủy) — KHÔNG ghi đè im lặng (AF-5)
  When chọn "Hủy"
  Then compose box giữ nguyên nội dung cũ
  When chèn thất bại (giả lập không tìm thấy compose box)
  Then giữ nội dung trong preview để copy tay + gợi ý Diagnose (EF-1 UC-02, ERR-09)
```

### TC-412: Vision fallback mặc định TẮT (FSD TC-13)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Security E2E |
| Requirement | US-10 AC3, BR-03, FR-GD4-05 |
| Preconditions | Cài mới; DevTools theo dõi network |

```gherkin
Scenario: T3 opt-in đúng điều kiện kép
  Given extension cài mới (chưa đụng Options)
  When kiểm tra Options → vision toggle
  Then toggle TẮT mặc định, chưa có bất kỳ request captureVisibleTab nào (BR-03)
  When bật vision → hiển thị cảnh báo privacy "ảnh chụp màn hình email sẽ gửi tới vision LLM" (FR-GD4-05)
  And phá T1 + T2 (DevTools) rồi bấm phân tích
  Then T3 chạy: captureVisibleTab → ảnh nén → vision LLM → định vị vùng đọc
  When tắt vision và phá T1+T2 lần nữa
  Then KHÔNG có capture nào — hiển thị ERR-06 + gợi ý Diagnose (BR-03)
```

### TC-413: Triage badge + Digest + cache (FSD TC-10)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional E2E |
| Requirement | US-08 AC1..4, FR-GD5-01..05, BR-07, BR-09 |
| Preconditions | Inbox hiển thị ≥ 20 email; provider hoạt động; mở panel |

```gherkin
Scenario: Triage inbox gắn badge và cập nhật Digest
  Given inbox hiển thị 20+ email (testdata/triage-testdata.csv TRI-E2E-01)
  When bấm "Triage inbox"
  Then tiến độ quét hiển thị (progress); kết thúc: badge màu trên list item theo score (US-08 AC1)
  And panel Digest liệt kê email ưu tiên kèm LÝ DO, sắp xếp score giảm dần (US-08 AC4, FR-GD5-04)
  When bấm Triage lần 2 (không yêu cầu quét lại)
  Then KHÔNG có LLM call nào cho messageId đã cache — console log xác nhận (BR-09; US-08 AC2)
  When chọn "quét lại" từ Digest
  Then cho phép bỏ cache và gọi LLM lại toàn bộ item hiển thị (UC-03 AF-2)
```

### TC-414: Auto-mode — mặc định TẮT + hàng chờ duyệt (FSD TC-12)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Functional/SAFETY E2E |
| Requirement | US-09 AC1..5, FR-GD6-01..06, BR-02, BR-13, BR-01 |
| Preconditions | TC-413 PASS; có email mới đến được (gửi test cho chính mình); rule theo automode-testdata AM-E2E-01 |

```gherkin
Scenario: Auto-mode fail-closed từ cài mới tới duyệt
  Given extension cài mới
  When kiểm tra AutomationSettings
  Then auto-mode toggle TẮT mặc định; khi TẮT không có bất kỳ hành động tự động nào (US-09 AC1, BR-02)
  When bật toggle
  Then hiện cảnh báo xác nhận "Extension sẽ tự soạn draft để bạn duyệt. Nó KHÔNG BAO GIỜ tự gửi email."
  When HỦY xác nhận
  Then toggle KHÔNG đổi trạng thái (EF-3 UC-07)
  When xác nhận bật + đặt rule sender "boss@x.com" + email mới từ boss đến
  Then email được tự phân tích + draft vào HÀNG CHỜ DUYỆT (status pending)
  And với rule RỖNG → chỉ phân tích, không draft nào (BR-13)
  When bấm Approve trên 1 item
  Then draft chèn vào Reply; người dùng TỰ bấm Send của OWA — extension không tự gửi (US-09 AC5, BR-01)
  When bấm Reject trên item khác
  Then item loại khỏi hàng chờ, không chèn (US-09 AC4)
  When dùng "Approve all"
  Then chèn lần lượt theo thứ tự hàng chờ; KHÔNG có thao tác Send nào (AF-1 UC-07)
  When tắt auto-mode khi còn hàng chờ
  Then hàng chờ GIỮ NGUYÊN, không tự hành động gì (FR-GD6-06)
```

### TC-415: Mốc kiểm thử thật cả 2 domain (FR-GD4-08)

| Attribute | Value |
|-----------|-------|
| Priority / Type | High · Compatibility E2E |
| Requirement | FR-GD4-08, US-06 AC3, PLAN.md mục 8 |
| Preconditions | TC-408 + TC-410 PASS trên 1 domain |

```gherkin
Scenario: Gate GĐ4 — analyze + reply end-to-end trên cả 2 domain
  Given tài khoản Work/School (outlook.office.com) và cá nhân (outlook.live.com)
  When lặp kịch bản TC-408 (analyze) + TC-410 (reply chèn) trên outlook.office.com
  Then PASS đầy đủ
  When lặp trên outlook.live.com
  Then PASS đầy đủ — chỉ được vào GĐ5 khi cả 2 domain PASS (FR-GD4-08)
```

### TC-613: NFR — first token ~3s (đo trên OWA thật)

```gherkin
Scenario: Chunk đầu tiên hiển thị trong ~3 giây
  Given provider cloud thông thường + email FIX-01
  When bấm "AI phân tích" và đo bằng DevTools Network (TTFB của request chat)
  Then chunk đầu tiên render trong panel trong vòng ~3s (mục tiêu, không SLA — FSD mục 8)
```

### TC-614: NFR — triage 20 email < 60s

```gherkin
Scenario: Triage 20 email hoàn tất dưới 60 giây
  Given inbox 20 email + batchSize 5 + throttle 1000ms
  When bấm "Triage inbox" và đo đồng hồ
  Then hoàn tất < 60s (sanity TDD: 12–24s); badge + Digest đầy đủ
```

---

## 6. SIT — System Integration / Visual / UX (TC-501..TC-510)

> Chỉ giữ những gì **không tự động hóa được**: visual layout, timing MV3 runtime thật, kịch bản exploratory. Thực thi trên OWA thật + DevTools. Bằng chứng: screenshot `evidence/TC-5xx-*.png`.

| ID | Test Case | Pri | Type | Requirement | Preconditions | Steps | Test Data | Expected Result |
|----|-----------|-----|------|-------------|---------------|-------|-----------|-----------------|
| TC-501 | Panel Shadow DOM không vỡ layout OWA | High | UI/Visual | FR-GD3-05, US-06 AC5 | Email đang mở, panel mở | (1) so sánh layout OWA trước/sau khi panel mở (2) thu nhỏ/phóng to window, đổi zoom 80–150% (3) đổi dark/light theme OWA | ui-owa OWA-01 | Layout OWA không xê dịch; panel không bị style của OWA phá (Shadow DOM cô lập 2 chiều) |
| TC-502 | Conversation view — thread context | Medium | Functional | UC-01 AF-1, FR-GD3-02 | Mở 1 conversation ≥ 3 email | (1) bấm phân tích (2) kiểm tra panel + console: threadContext các email trước được đưa vào prompt | email-fixture FIX-04 | Phân tích có ngữ cảnh hội thoại; detectedView="conversation" |
| TC-503 | Đổi email giữa chừng khi đang stream | Medium | Functional | UC-01 AF-4, FSD 5.3.1 | Đang stream analyze email A | (1) giữa chừng bấm chọn email B (2) quan sát panel | ui-owa OWA-02 | Request cũ bị cancel (Port cancel); panel bắt đầu phân tích email B; không lẫn nội dung A |
| TC-504 | So khớp messageId khi chèn (EF-5) | Medium | Functional | UC-02 EF-5 | Đang có draft preview của email A | (1) sinh draft cho email A (2) chuyển sang email B (3) bấm "Chèn vào Reply" | ui-owa OWA-03 | Cảnh báo "Draft này thuộc email khác"; KHÔNG chèn tự động; người dùng chọn hủy hoặc vẫn chèn |
| TC-505 | Storage quota đầy thật (FSD TC-14) | Medium | Functional | ERR-08, BR-04 | DevTools + bộ đệm lớn | (1) điền đầy storage.local bằng dữ liệu test (2) chạy triage cho email mới | storage-testdata STO-QUOTA-02 | Thông báo ERR-08 "Bộ nhớ extension đầy — nên dọn cache"; dữ liệu cũ giữ nguyên; KHÔNG mất apiKey |
| TC-506 | Toggle tắt extension | Medium | Functional | FR-GD1-02, US-01 | Popup mở | (1) tắt extension qua toggle (2) thử bấm nút phân tích/triage trên OWA (3) bật lại | ui-owa OWA-04 | Khi tắt: mọi tính năng ngừng hoạt động; bật lại hoạt động bình thường |
| TC-507 | Diagnose report redact | Medium | Security | UC-09, FR-GD4-06, BR-08, BR-05 | Diagnose mode bật sau 1 luồng lỗi | (1) bật Diagnose từ thông báo lỗi ERR-06 (2) xuất report (3) đọc toàn bộ report | ui-owa OWA-05 | Report chỉ có cấu trúc DOM/a11y + role/label chức năng; body email ĐƯỢC REDACT; có cảnh báo rà soát trước khi gửi |
| TC-508 | Stream dài > 2 phút không đứt (heartbeat) | Medium | Non-Functional | NFR TDD §10, FSD 5.3.1, Open Issue #9 | Ollama local + prompt dài (draft dài) | (1) yêu cầu draft rất dài (stream > 2 phút) (2) quan sát console ping mỗi 20s (3) stream chạy đến done | ui-owa OWA-06 | Stream không đứt (heartbeat giữ SW sống) trên Chrome VÀ Edge; nếu đứt → ERR-07 giữ phần đã nhận (fallback an toàn) |
| TC-509 | Virtualized list — cuộn quét bổ sung | Medium | Functional | UC-03 AF-5, BR-07, BR-09 | Inbox dài > 1 viewport | (1) triage (chỉ item trong DOM được quét) (2) cuộn xuống hiện item mới (3) triage tiếp | triage-testdata TRI-VIRT-01 | Chỉ quét item đang hiển thị (BR-07); item đã cache không tốn token (BR-09); không lỗi DOM trống |
| TC-510 | Sai key khi phân tích — ERR-02 không lộ key | High | Security | ERR-02, BR-08, FSD manual #7 | Provider cloud + key sai | (1) đặt key sai "sk-wrong" (2) bấm phân tích (3) đọc panel + toàn bộ console | ui-owa OWA-07 | Panel hiện "API key không hợp lệ hoặc không có quyền" + nút sửa key nhanh; console KHÔNG chứa "sk-wrong" (BR-08) |

