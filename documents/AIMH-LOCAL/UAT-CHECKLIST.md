# UAT-CHECKLIST — AIMH-LOCAL (Gate chấp nhận người dùng trên OWA thật)

## AIMailHelper — Trợ lý AI cho Outlook Web (Browser Extension MV3)

> **Đây là checklist DUY NHẤT cho UAT** — gom toàn bộ verification manual theo **DECISION #63**
> (RUN-LOG): (A) 45 probes OWA-DOM-SPIKE, (B) luồng chính GĐ1→GĐ6, (C) STC TC-401..415 + TC-501..510
> rút gọn, (D) TD-G5-2 container-reuse, (E) TD-G6-4 detect email mới. Automated đã PASS 366/366
> (TEST-REPORT.md) — phần này là phần **mắt người + OWA thật**.
>
> **Cách điền:** ô kết quả ghi `PASS` / `FAIL` / `N/A`; riêng Phần A ghi `PASS` / `ADJUSTED`
> (đã sửa selector — ghi selector thay thế) / `MISSING` (cần strategy khác). Chụp màn hình lưu
> `documents/AIMH-LOCAL/evidence/U-<mã>-*.png`. Sau UAT: cập nhật cột Status của TC tương ứng trong
> `TEST-REPORT-AIMH-LOCAL.csv` (DEFERRED-TO-UAT → PASS/FAIL).

---

## Phần 0 — Chuẩn bị (6 bước)

| # | Hành động | Kết quả mong đợi | Kết quả |
|---|-----------|------------------|---------|
| U-01 | Chạy `npm run build` trong thư mục dự án | Exit 0; thư mục `dist/` có `manifest.json` | ☐ |
| U-02 | `chrome://extensions` → bật Developer mode → **Load unpacked** → chọn thư mục `dist/` | Extension "AIMailHelper" enabled, KHÔNG nút Errors; console không lỗi extension | ☐ |
| U-03 | Lặp U-02 trên Edge (`edge://extensions`) — tùy chọn nhưng khuyến nghị (FR-GD4-08 đo trên 2 browser) | Kết quả tương tự | ☐ |
| U-04 | Cài Ollama → `ollama pull llama3.2` → set biến môi trường `OLLAMA_ORIGINS=chrome-extension://*` → khởi động lại `ollama serve` | `http://localhost:11434` trả "Ollama is running" khi mở bằng browser | ☐ |
| U-05 | Đăng nhập 2 tài khoản OWA: 1 work/school (`outlook.office.com` hoặc `office365.com`) + 1 personal (`outlook.live.com`); chuẩn bị 1 cloud key (OpenAI/Gemini/Anthropic/Azure tùy có) | Cả 2 tab OWA hoạt động; key cloud sẳn sàng | ☐ |
| U-06 | Mở Options (popup → nút mở Options): cấu hình **1 cloud** (nhập key → Test Connection) và **Ollama local** (URL `http://localhost:11434`, preset Ollama → Test Connection) | Cả 2 hiện **"✓ OK (…ms)"** màu xanh; lưu được (BR-17: không bị chặn bởi lỗi phụ) | ☐ |

> Sau phần 0: mở DevTools (F12) trên tab OWA — dùng cho Phần A/C. Bật console filter `AIMH` để thấy log locator.

---

## Phần A — 45 probes OWA-DOM-SPIKE trên OWA thật

> Cách verify chung: DevTools → **Console** → chạy `document.querySelectorAll("<selector>").length`
> (hoặc dán selector vào Elements → Ctrl+F). Rà cả **3 chế độ xem** (reading pane / popout / conversation)
> và **2 ngôn ngữ UI OWA** (EN + VI) khi probe có ghi chú. Trạng thái: `PASS` = khớp; `ADJUSTED` = selector
> sai nhưng xác định được selector đúng (ghi vào cột Fix); `MISSING` = không tồn tại trên build OWA này.

### A1. Selector chain T1 — selectors.ts (probe 1–11)

| # | Selector (file) | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-----------------|------------------|------------------|--------------|------------|
| U-A01 | `[role="main"] [aria-label*="Message" i]` (selectors.ts — reading-pane #1) | Mở 1 email (reading pane); đếm phần tử | ≥1 block message; popout có thể khác — ghi chú | Đổi sang selector đúng của block message; cập nhật SELECTOR_CHAINS | ☐ |
| U-A02 | `[data-conversation]` (reading-pane #2) | Mở 1 thread ≥2 email | ≥1 container hội thoại; đọc giá trị id | Tìm attribute marker hội thoại khác | ☐ |
| U-A03 | `[role="main"] [role="toolbar"]` (message-toolbar #1) | Đếm toolbar trong vùng đọc | ≥1 toolbar chứa hành động Reply | Scope thêm vào chain | ☐ |
| U-A04 | `[role="toolbar"]` (message-toolbar #2) | Kiểm tra popout (không role=main) | Toolbar đầu tiên chứa Reply (không nhầm ribbon khác) | Thêm bộ lọc | ☐ |
| U-A05 | `[aria-label*="Reply" i]:not([aria-label*="all" i])` (reply-button #1) | Hover nút Reply đọc aria-label; kiểm tra "Reply all" bị loại | Nút Reply khớp; Reply all KHÔNG khớp | Điều chỉnh regex loại trừ | ☐ |
| U-A06 | `[aria-label*="Trả lời" i]:not([aria-label*="Tất cả" i])` (reply-button #2) | Đổi UI OWA sang tiếng Việt rồi verify | Tương tự trên label VI | Cập nhật label VI thật | ☐ |
| U-A07 | `[role="textbox"][aria-multiline="true"]` (compose-box #1) | Mở Reply → đếm khung soạn | Đúng 1 khung soạn chính (search box KHÔNG rơi vào) | Thêm filter label | ☐ |
| U-A08 | `[aria-label*="Compose" i][role="textbox"]` (compose-box #2) | Đọc aria-label thật của khung soạn | Khớp label chứa "Compose" | Ghi label thật | ☐ |
| U-A09 | `[aria-label*="trả lời" i][role="textbox"]` (compose-box #3) | UI OWA tiếng Việt + mở Reply | Khớp label VI | Ghi label VI thật | ☐ |
| U-A10 | `[role="list"]` (inbox-list #1) | Tìm list inbox (không nhầm folder pane) | Đúng list chứa các email | Thêm scope container | ☐ |
| U-A11 | `[role="listitem"]` (inbox-item #1) | Cuộn list ảo — đếm item | Chỉ item đang hiển thị có trong DOM | — | ☐ |

### A2. Diagnose-only — SEND_BUTTON_SELECTORS (probe 12–13)

| # | Selector | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|----------|------------------|------------------|--------------|------------|
| U-A12 | `[aria-label*="Send" i]` | Mở compose → tìm nút gửi (EN) | Có đúng 1 nút Send chính; ghi phần tử trùng (nếu có) | Cập nhật SEND_BUTTON_SELECTORS | ☐ |
| U-A13 | `[aria-label*="Gửi" i]` | Đổi UI OWA sang VI → tìm lại | Nút "Gửi" khớp | Cập nhật label VI | ☐ |

### A3. Structural probe — detector.ts (probe 14–17)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A14 | MESSAGE_PROBE `[aria-label*="Message" i], [data-conversation]` | Rà 3 chế độ xem + đổi ngôn ngữ UI | Block message nhận diện được ở cả 3 chế độ | Bổ sung probe | ☐ |
| U-A15 | CONVERSATION_PROBE `[data-conversation]` | Mở thread >2 email | Probe trúng container đúng | Marker khác | ☐ |
| U-A16 | DIALOG_PROBE `[role="dialog"] …` | Mở email popout | Probe + `closest('[role="dialog"]')` trả đúng container | Bổ sung probe popout | ☐ |
| U-A17 | MAIN_PROBE `[role="main"] …` | Reading pane; kiểm tra popout có role=main không | Reading pane nhận diện; ghi popout có/không main | Điều chỉnh DETECT | ☐ |

### A4. Message-id — message-id.ts (probe 18–22)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A18 | `[data-itemid]` (S1) | Xem list item + container đọc email | Có attribute; giá trị là ExchangeId | Tìm attribute id khác | ☐ |
| U-A19 | `[data-convid]` (S1) | Conversation mode — list item | Có id hội thoại | — | ☐ |
| U-A20 | `[data-message-id]` (S1) | So sánh office.com vs live.com | Ghi tên attribute thật mỗi domain (giống/khác) | Thêm biến thể | ☐ |
| U-A21 | href regex `AAMk[A-Za-z0-9+/=]{20,}` (S2) | `document.querySelectorAll("a[href]")` trong item → tìm "AAMk" | Có deep-link chứa ExchangeId | Mở rộng regex/feature | ☐ |
| U-A22 | S3 synthetic hash (subject\|sender\|preview-50) | Khi S1/S2 rỗng: đọc id 2 lần liên tiếp | Synthetic id ỔN ĐỊNH giữa re-render | Cập nhật công thức TD-7 | ☐ |

### A5. Đọc nội dung — reader.ts (probe 23–28)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A23 | SUBJECT_PROBE `[role="heading"], h1, h2` | Mở email; tìm heading trong container | Trúng đúng subject email đang mở | Bổ sung probe subject | ☐ |
| U-A24 | BODY_PROBE `[aria-label*="body" i]` | Đọc label khung nội dung (EN + VI) | Label chứa "body"/"nội dung"; khớp 2 ngôn ngữ | Ghi label thật | ☐ |
| U-A25 | FROM_PATTERN `From/Từ` | Đọc aria-label hàng người gửi | Bắt đầu "From:"/"Từ:" + tên + email | Cập nhật pattern | ☐ |
| U-A26 | TO_PATTERN `To/Đến` | Email nhiều người nhận | Parse đúng, phân tách , ; | Cập nhật pattern | ☐ |
| U-A27 | CC_PATTERN `Cc` | Email có Cc / không Cc | Có Cc → khớp; không Cc → 0 phần tử | — | ☐ |
| U-A28 | ≥2 block message → threadContext | Mở thread; verify thứ tự cũ→mới | Excerpt đủ đọc, đúng thứ tự | Điều chỉnh buildThreadContext | ☐ |

### A6. A11y snapshot — a11y-tree.ts (probe 29–33)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A29 | implicit role | DevTools → Accessibility pane so role | OWA dùng role chuẩn cho control chức năng | Bổ sung INTERACTIVE_ROLES | ☐ |
| U-A30 | label chức năng KHÔNG chứa nội dung email | Chạy extension; bật log `[AIMH][locator]` | Snapshot KHÔNG chứa subject/body (SR-02/M-2) | Siết filter | ☐ |
| U-A31 | isHidden | So số node snapshot với control nhìn thấy | Node ẩn không xuất hiện | Cập nhật isHidden | ☐ |
| U-A32 | MAX_DEPTH 18 / 20K chars | Email dài + bật Diagnose | Không truncated thường trực; flag đúng khi vượt | Tăng limit (nếu cần) | ☐ |
| U-A33 | shadowRoot trong OWA chính | `document.querySelectorAll("*").forEach(e => e.shadowRoot && console.log(e))` | Ghi có/không shadow root (hiện không có) | Bổ sung walk shadowRoot | ☐ |

### A7. Layout-hash — layout-hash.ts (probe 34–37)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A34 | region toolbar | Chuyển email khác | Hash KHÔNG đổi | — | ☐ |
| U-A35 | region list | Cuộn list | Hash ổn định (virtualization không đổi signature) | Loại region khỏi signature | ☐ |
| U-A36 | region reading | Đổi email | Hash giữ nguyên (BR-06 — cache còn hiệu lực) | — | ☐ |
| U-A37 | region compose | Đổi role/khung compose (mock) | Hash ĐỔI → cache tự vô hiệu | — | ☐ |

### A8. Semantic locator — semantic-locator.ts (probe 38)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A38 | `tag[role="…"][aria-label="…"]` ≤4 cấp | Sau cache hit (reload trang) → element đúng | Không trúng phần tử khác; label ký tự đặc biệt escape đúng | Cập nhật deriveStructuralSelector | ☐ |

### A9. Triage — triage.ts (probe 39–45)

| # | Probe | Hành động verify | Kết quả mong đợi | Fix nếu FAIL | Trạng thái |
|---|-------|------------------|------------------|--------------|------------|
| U-A39 | listitem BÊN TRONG `[role="list"]` | So số listitem trong list với số email hiển thị | Chỉ email trong inbox bị quét (BR-07) | Siết scope collectInboxItems | ☐ |
| U-A40 | heading trong listitem (subject) | Verify subject từng row (kể cả row thread 2 heading) | Đọc đúng subject mỗi row | Chọn heading đầu/hợp lệ | ☐ |
| U-A41 | aria-label From/Từ trong listitem | Đọc label thật hàng sender trong list | "From:"/"Từ:" khớp cả 2 ngôn ngữ | Cập nhật firstLabeled | ☐ |
| U-A42 | S1 id TRÊN LISTITEM | Xem attribute id cấp row; click mở so khớp | Row mang ExchangeId khớp email khi mở | Thêm fallback S2 row | ☐ |
| U-A43 | Badge appendChild span vào row | Chạy triage thật | Badge hiện góc row, row KHÔNG vỡ layout | Đổi cách inject (CSS class riêng) | ☐ |
| U-A44 | Đổi folder → container list bị THAY THẾ? | Giữa chừng quét → click folder khác | Quét DỪNG giữ kết quả (EF-2); ghi OWA thay thế hay reuse container → **chuyển tiếp Phần D** | TD-G5-2 signal bổ sung | ☐ |
| U-A45 | Virtualized scroll + badge cũ | Cuộn xuống rồi lên lại | Item mới vào DOM; badge row cũ còn khi quay lại (hoặc quét lại gắn lại) | Cache badge theo messageId | ☐ |

> **Sau Phần A:** mọi probe `ADJUSTED`/`MISSING` → lập batch fix selector (sửa selectors.ts/detector.ts/
> reader.ts/message-id.ts/triage.ts + fixture test) rồi chạy lại probe trước khi tính UAT PASS.

---

## Phần B — Luồng chính GĐ1 → GĐ6 (12 bước)

> Thực hiện tuần tự trên **1 domain OWA** đã login (ưu tiên `outlook.office.com`). Provider: dùng Ollama
> local đã cấu hình ở U-06 (0-cost). Chọn 1 email "đẹp" có: người gửi rõ, nội dung ≥2 đoạn, có ngày hẹn
> trong text (deadline).

| # | Hành động cụ thể | Kết quả mong đợi | Kết quả |
|---|------------------|------------------|---------|
| U-B01 | Mở email đã chọn trong reading pane → nhìn toolbar hành động của email | Nút **"AI phân tích"** của extension xuất hiện trong toolbar (nếu KHÔNG thấy → quay lại probe U-A03 + ghi nhận; đây là finding BA review UG v1.1) | ☐ |
| U-B02 | Bấm "AI phân tích" → chờ streaming chạy hết | Panel (Shadow DOM) hiện streaming vài giây; khi done đủ **5 khía cạnh**: tóm tắt, độ quan trọng (score + badge MÀU), ý định & hành động, deadline, cảm xúc (US-06 AC1/AC2) | ☐ |
| U-B03 | Bấm **"Soạn trả lời"** → chọn tone "chính thức", ngôn ngữ "VI", gõ extraInstructions "Nhắc lại lịch họp thứ 3" → chờ done | Draft preview streaming; nút **"Chèn vào Reply"** chỉ bật khi draft có nội dung (BR-10) | ☐ |
| U-B04 | Bấm **"Chèn vào Reply"** → QUAN SÁT kỹ (BR-01 — safety) | Compose box Reply của OWA tự mở và chứa draft; **extension KHÔNG bấm Send** — không có email nào được gửi; không có thao tác lạ trên nút gửi | ☐ |
| U-B05 | Tự tay bấm nút **Send của OWA** | Email gửi bình thường — gửi thư là hành động 100% của người dùng (US-07 AC2) | ☐ |
| U-B06 | Mở panel → tab Digest → bấm **"Triage inbox"** (inbox đang hiển thị ≥10 email) | Progress hiển thị; kết thúc: **badge màu** trên từng list item (đỏ ≥70 / cam 40–69 / xanh <40) (US-08 AC1) | ☐ |
| U-B07 | Xem lại panel Digest sau khi quét | Danh sách email ưu tiên kèm **LÝ DO** (reason), sắp xếp score **giảm dần** (FR-GD5-04); Digest trống trước đó phải có gợi ý "Chạy Triage" (EF-1) | ☐ |
| U-B08 | Bấm **Triage lần 2** (không yêu cầu quét lại) | Hoàn tất gần như ngay; DevTools Network: **KHÔNG có request LLM mới** cho email đã chấm (BR-09 cache); nếu chọn "quét lại" → gọi lại toàn bộ (AF-2) | ☐ |
| U-B09 | Options → **Tự động hóa**: (1) kiểm tra trạng thái mặc định TRƯỚC khi đụng; (2) bật toggle → đọc dialog; (3) thử **Hủy**; (4) bật lại và **Xác nhận** | (1) Auto-mode **TẮT mặc định** (BR-02); (2) cảnh báo "sẽ tự soạn draft để bạn duyệt — KHÔNG BAO GIỜ tự gửi"; (3) Hủy → toggle KHÔNG đổi (EF-3); (4) bật thành công | ☐ |
| U-B10 | Thêm rule sender = địa chỉ email của chính bạn (hoặc boss thật); từ điện thoại/ tab ẩn danh **gửi 1 email mới** cho chính mình | Email mới tự được phân tích → draft rơi vào **HÀNG CHỜ DUYỆT (pending)**; KHÔNG tự chèn, KHÔNG tự gửi; badge N chờ duyệt trên panel | ☐ |
| U-B11 | Trong hàng chờ: bấm **Approve** 1 item → tự bấm Send OWA; bấm **Reject** item khác; thử **Approve all** với ≥2 item | Approve → draft chèn vào Reply, người dùng tự Send (BR-01); Reject → item loại khỏi hàng chờ; Approve all → chèn lần lượt, KHÔNG Send tự động; tắt auto-mode khi còn hàng chờ → hàng chờ GIỮ NGUYÊN (FR-GD6-06) | ☐ |
| U-B12 | Options → Chung → UI language: đổi **vi → en**; xem popup + panel + Options; vào PromptSettings xem "ngôn ngữ trả lời" | Cả 3 bề mặt sang tiếng Anh NGAY; ngôn ngữ trả lời AI là **setting riêng** không đổi theo (BR-11); đổi lại vi | ☐ |

---

## Phần C — STC manual rút gọn: TC-401..415 (E2E-UI) + TC-501..510 (SIT)

> 25 TC — mỗi TC gồm 2–3 bước; điền PASS/FAIL từng bước. TC-408/410/413/414 có thể đã phủ một phần ở
> Phần B — vẫn chạy lại theo checklist này để đóng dòng CSV tương ứng.

### TC-401..407 — Cài đặt, Options, provider (7 TC)

| # | Hành động | Kết quả mong đợi | Kết quả |
|---|-----------|------------------|---------|
| U-C401a | Đóng trình duyệt hoàn toàn → mở lại → `chrome://extensions` | Extension vẫn enabled, không error sau restart | ☐ |
| U-C401b | Kiểm tra console trang extensions + 1 tab OWA | Không lỗi liên quan extension | ☐ |
| U-C402a | Bấm icon extension mở popup | Hiển thị provider active + toggle bật/tắt + nút mở Options | ☐ |
| U-C402b | Tắt extension qua toggle → đóng popup → mở lại; sau đó đóng hẳn trình duyệt → mở lại | Trạng thái toggle giữ đúng giá trị; provider/uiLanguage đọc lại đúng từ storage (US-01 AC5) | ☐ |
| U-C403a | Mở Options đếm section | Đủ 6 section: Provider, Model, Test Connection, Prompt, Tự động hóa, Chung | ☐ |
| U-C403b | Mở lần lượt outlook.office.com / office365.com / outlook.live.com → tìm nút extension | Content script inject trên **CẢ 3 domain** (nút hiện, console sạch) | ☐ |
| U-C403c | Mở gmail.com | KHÔNG inject (không có nút/log extension — đúng host_permissions) | ☐ |
| U-C404a | Lần lượt **Chat test** cho các provider đã cấu hình (tối thiểu Ollama + 1 cloud; đủ 6 nếu có key) | Streaming kết quả hiển thị trong Options cho provider đúng cấu hình (US-02 AC2) | ☐ |
| U-C404b | Tắt env OLLAMA_ORIGINS → restart ollama → Chat test Ollama | ERR-05 kèm hướng dẫn đặt OLLAMA_ORIGINS + kiểm tra port 11434 (FR-GD2-07) | ☐ |
| U-C405a | Bấm "Kiểm tra kết nối" (provider đúng) | Kết quả XANH "OK (200)", latencyMs > 0, nút disable trong lúc gọi | ☐ |
| U-C405b | Đổi key cloud thành key SAI → test lại | Kết quả ĐỎ, lỗi rõ ràng; **KHÔNG thấy giá trị key** ở bất kỳ đâu (BR-08) | ☐ |
| U-C405c | Xóa 1 trường bắt buộc → test | Chặn ngay "Còn thiếu: …" — không gọi API (ERR-11/15) | ☐ |
| U-C406a | Provider openai + key hợp lệ → bấm fetch models | Dropdown hiện danh sách; ô nhập tay VẪN dùng được (BR-17) | ☐ |
| U-C406b | Chuyển sang Azure | Nút fetch BỊ ẨN; chỉ nhập tay endpoint + deployment + api-version | ☐ |
| U-C407a | Đổi UI language vi↔en trong General | Popup + panel + Options cập nhật NGAY; privacy note đúng ngôn ngữ mới | ☐ |
| U-C407b | (dev tùy chọn) Render key i18n lạ | Fallback English; vẫn thiếu → raw key + warn, UI không vỡ (ERR-13) | ☐ |

### TC-408..412 — Analyze, self-healing, reply, vision (5 TC)

| # | Hành động | Kết quả mong đợi | Kết quả |
|---|-----------|------------------|---------|
| U-C408a | Mở email có deadline trong nội dung → "AI phân tích" | Streaming → đủ 5 khía cạnh + badge màu score; nút "Soạn trả lời" xuất hiện sau done | ☐ |
| U-C408b | Mở email rỗng/nháp trống → "AI phân tích" | "Không đọc được nội dung email" (ERR-10); KHÔNG có LLM call (Network trống — BR-14) | ☐ |
| U-C408c | Xóa cấu hình provider (Options) → "AI phân tích" | "Chưa cấu hình provider" + nút mở Options; KHÔNG có LLM call (EF-5 UC-01) | ☐ |
| U-C409a | Analyze OK 1 lần → DevTools **xóa/đổi attribute aria-label** mà T1 phụ thuộc → analyze lại | Vẫn thành công qua **T2** (log tier T2); không cần update extension (US-06 AC4) | ☐ |
| U-C409b | Reload trang → analyze lại | Log tier = **cache** — 0 token (BR-06); vision TẮT nên chưa từng có T3 | ☐ |
| U-C410a | Panel có kết quả → Soạn trả lời → chọn ngôn ngữ "VI" khi UI đang EN → Chèn vào Reply | Draft **tiếng Việt** (replyLanguage độc lập uiLanguage — BR-11); compose chứa draft | ☐ |
| U-C410b | **BR-01 quan sát:** trong toàn bộ quá trình (U-B04 + U-C410a) | Extension không có nút Send; không click event nào lên nút Send OWA; email không tự gửi | ☐ |
| U-C411a | Mock/ép stream trả draft rỗng (hoặc dùng email cực ngắn) → done | Nút "Chèn vào Reply" DISABLED (BR-10) | ☐ |
| U-C411b | Gõ sẵn 1 câu trong compose box OWA → sinh draft mới → Chèn | Panel **HỎI xác nhận** (thay thế / ghép thêm / hủy) — không ghi đè im lặng (AF-5); chọn Hủy → giữ nguyên nội dung cũ | ☐ |
| U-C411c | (tùy chọn) Ép chèn thất bại (đóng compose đột ngột) | Giữ draft trong preview để copy tay + gợi ý Diagnose (EF-1, ERR-09) | ☐ |
| U-C412a | Cài mới (hoặc reset storage) → mở DevTools Network → không đụng Options | KHÔNG có request captureVisibleTab nào; toggle Vision TẮT (BR-03) | ☐ |
| U-C412b | Bật Vision → đọc cảnh báo → phá T1+T2 (DevTools) → analyze | Cảnh báo privacy hiện; T3 chạy: capture → ảnh nén → định vị được vùng đọc | ☐ |
| U-C412c | Tắt Vision → phá T1+T2 lần nữa → analyze | KHÔNG có capture; ERR-06 + gợi ý Diagnose (BR-03) | ☐ |

### TC-413..415 — Triage/Digest, auto-mode, 3 domain (3 TC)

| # | Hành động | Kết quả mong đợi | Kết quả |
|---|-----------|------------------|---------|
| U-C413a | Inbox ≥20 email, cache trống (xóa storage extension nếu cần) → Triage | Progress; badge đủ item; Digest sort giảm dần + lý do (US-08 AC1/AC4) | ☐ |
| U-C413b | Triage lại lần 2 | Network KHÔNG có request cho messageId đã cache (BR-09/US-08 AC2); "quét lại" → gọi lại toàn bộ | ☐ |
| U-C414a | Reset storage (cài mới) → Options → Tự động hóa | Toggle TẮT mặc định; khi TẮT không có hành động tự động nào (US-09 AC1, BR-02) | ☐ |
| U-C414b | Lặp toàn bộ kịch bản U-B09 → U-B11 trên build này | Confirm dialog, hàng chờ, Approve/Reject/Approve all, 0 tự Send (US-09, BR-13, BR-01) | ☐ |
| U-C415a | Lặp U-C408a + U-C410a trên **outlook.office.com** | PASS đầy đủ | ☐ |
| U-C415b | Lặp trên **outlook.office365.com** VÀ **outlook.live.com** | PASS đầy đủ trên CẢ 3 domain (FR-GD4-08; US-06 AC3) — gate bắt buộc | ☐ |

### TC-501..510 — SIT visual/UX/timing (10 TC)

| # | Hành động | Kết quả mong đợi | Kết quả |
|---|-----------|------------------|---------|
| U-C501 | Mở panel; so sánh layout OWA trước/sau; zoom 80–150%; đổi dark/light theme OWA | Layout OWA không xê dịch; panel không bị style OWA phá (Shadow DOM 2 chiều) | ☐ |
| U-C502 | Mở conversation ≥3 email → analyze | Panel có ngữ cảnh hội thoại (threadContext); detectedView=conversation | ☐ |
| U-C503 | Đang stream analyze email A → bấm chọn email B giữa chừng | Request A bị cancel; panel chuyển sang phân tích B; không lẫn nội dung A | ☐ |
| U-C504 | Sinh draft cho email A → chuyển sang email B → bấm "Chèn vào Reply" | Cảnh báo "Draft này thuộc email khác"; KHÔNG chèn tự động; được phép hủy hoặc vẫn chèn | ☐ |
| U-C505 | (tùy chọn, khó) Điền đầy chrome.storage.local bằng dữ liệu lớn (DevTools) → triage email mới | Thông báo ERR-08 "Bộ nhớ extension đầy"; dữ liệu cũ giữ nguyên; KHÔNG mất apiKey | ☐ |
| U-C506 | Toggle tắt extension trong popup → thử bấm "AI phân tích"/"Triage" trên OWA → bật lại | Khi tắt: mọi tính năng ngừng; bật lại hoạt động bình thường | ☐ |
| U-C507 | Gây 1 lỗi DOM (đổi aria-label) → mở Diagnose từ thông báo lỗi → xuất report → đọc TOÀN BỘ report | Report chỉ có cấu trúc DOM/a11y + role/label chức năng; body email ĐƯỢC REDACT; có cảnh báo rà soát trước khi gửi | ☐ |
| U-C508 | Ollama local + yêu cầu draft RẤT DÀI (>2 phút stream) → theo dõi console ping mỗi 20s | Stream không đứt đến done (heartbeat); nếu đứt → ERR-07 giữ phần đã nhận; thử cả Chrome và Edge | ☐ |
| U-C509 | Inbox dài >1 viewport → triage (chỉ item trong DOM) → cuộn xuống hiện item mới → triage tiếp | Lần 1 chỉ quét item hiển thị (BR-07); lần 2 chỉ gọi LLM cho item chưa cache (BR-09); không lỗi DOM trống | ☐ |
| U-C510 | Đặt key cloud SAI ("sk-wrong") → analyze → đọc panel + TOÀN BỘ console | Panel: "API key không hợp lệ hoặc không có quyền" + nút sửa key; console KHÔNG chứa "sk-wrong" (BR-08) | ☐ |

---

## Phần D — TD-G5-2: container-reuse check (folder guard EF-2/EF-4)

> Bối cảnh (TA review GĐ5 — RUN-LOG #67): triage dừng an toàn khi **đổi folder giữa chừng** dựa trên giả
> định OWA **thay thế** list container khi đổi folder. Nếu OWA **reuse** cùng container → folder guard có
> thể câm lặng. Đây là check điều kiện High — quyết định có cần signal bổ sung hay không.

| # | Hành động cụ thể | Kết quả mong đợi | Kết quả |
|---|------------------|------------------|---------|
| U-D01 | Inbox nhiều email (≥30) → mở panel → bấm "Triage inbox" → **GIỮA CHỪNG quét** (khi progress chưa xong) click sang folder khác (vd Sent Items) | Quét **DỪNG ngay**, giữ kết quả các batch đã xong, không badge thêm cho folder mới (EF-2/EF-4); panel ghi chú dừng an toàn | ☐ |
| U-D02 | Ở folder mới → bấm Triage lại | Quét bình thường trên folder mới — không crash, không badge leech sang list cũ | ☐ |
| U-D03 | Trong lúc U-D01 mở DevTools Elements: chọn node `[role="list"]` → quan sát khi click folder khác | Ghi kết luận: (a) container **bị THAY THẾ** (node mới) → thiết kế hiện tại đúng → TD-G5-2 đóng; (b) container **REUSE** (cùng node, đổi nội dung) mà quét KHÔNG dừng → **TD-G5-2 cần signal bổ sung** (flag cho DEV: so sánh signature + theo dõi folder selection) | ☐ |
| U-D04 | Lặp U-D01 trên domain thứ 2 (outlook.live.com) | Hành vi nhất quán giữa 2 domain | ☐ |

---

## Phần E — TD-G6-4: auto-mode detect email mới khi đang mở mail khác

> Bối cảnh (TA review GĐ6 — RUN-LOG #70): detect email mới hiện theo dõi biến động **inbox list**
> (MutationObserver). Kiểm chứng intent FR-GD6-02: nhận được email mới **kể cả khi người dùng đang mở
> email khác**, và xử lý đúng email MỚI (không lẫn email đang mở).

| # | Hành động cụ thể | Kết quả mong đợi | Kết quả |
|---|------------------|------------------|---------|
| U-E01 | Auto-mode đang BẬT (đã xác nhận ở U-B09) + rule sender = chính bạn; mở 1 email A bất kỳ trong reading pane và GIỮ nguyên | Observer vẫn chạy nền; không có hành động lạ với email A | ☐ |
| U-E02 | Từ điện thoại/ tab ẩn danh gửi 1 email mới (tiêu đề distinctive "UAT-E2E-…") cho chính mình → **KHÔNG đụng chuột/bàn phím trên tab OWA** | — (chuẩn bị) | ☐ |
| U-E03 | Chờ 10–60s (đợi email về + list cập nhật) | Email mới xuất hiện trong inbox list; badge triage (nếu có) / hàng chờ có item **pending thuộc email MỚI** — KHÔNG phải email A đang mở (FR-GD6-02 một phần) | ☐ |
| U-E04 | Bấm **Approve** item vừa pending → nhìn compose box | Draft nội dung dựa trên **EMAIL MỚI** (tiêu đề/nội dung "UAT-E2E-…"), KHÔNG lẫn nội dung email A; người dùng tự bấm Send của OWA (BR-01) | ☐ |
| U-E05 | (biên âm) Gửi email mới KHÔNG khớp rule (địa chỉ lạ) | Chỉ được phân tích, KHÔNG có draft vào hàng chờ (BR-13) | ☐ |
| U-E06 | Ghi kết luận TD-G6-4 | (a) Detect hoạt động khi đang mở mail khác → PASS; (b) Chỉ detect khi email đó đang mở → ghi **TD-G6-4 cần SA amendment** (mở rộng observer scope) | ☐ |

---

## Phần F — Tổng kết & tiêu chí UAT PASS

### Điểm tổng

| Phần | Số mục | PASS | FAIL/ADJUSTED/MISSING | Ghi chú |
|------|--------|------|----------------------|---------|
| 0 — Chuẩn bị | 6 | | | N/A không tính fail |
| A — 45 probes | 45 | | | PASS/ADJUSTED/MISSING |
| B — Luồng chính | 12 | | | |
| C — 25 TC rút gọn | 45 | | | TC-401..415 + TC-501..510 |
| D — TD-G5-2 | 4 | | | U-D03 quyết định cần fix |
| E — TD-G6-4 | 6 | | | U-E06 kết luận |
| **TỔNG** | **118** | | | |

### Tiêu chí UAT GATE = PASS khi

1. **Phần 0 + Phần B: 100% PASS** (luồng chính GĐ1→GĐ6 dùng được end-to-end).
2. **Mọi step liên quan an toàn PASS**: U-B04, U-C410b, U-C414a/b, U-E04 (BR-01 không tự Send; BR-02/BR-13 fail-closed) — chỉ 1 FAIL ở đây = **chặn Release**.
3. **45 probes**: không còn `MISSING` nào chưa có phương án; `ADJUSTED` đã có fix + fixture cập nhật (fix batch selector trước khi tính PASS).
4. **TD-G5-2 (U-D03)** + **TD-G6-4 (U-E06)** có kết luận rõ; nếu cần signal/amendment → lập ticket fix batch trước Release.
5. TC-415: analyze + reply PASS trên **cả 3 domain OWA**.

### Việc cần làm sau UAT

1. Cập nhật `TEST-REPORT-AIMH-LOCAL.csv`: đổi Status các TC manual (TC-401..415, TC-501..510, TC-613/614) từ DEFERRED-TO-UAT → PASS/FAIL; điền Executed_Date + Evidence_Path.
2. Điền trạng thái 45 probes vào `OWA-DOM-SPIKE.md` (cột Trạng thái + bảng Build OWA cuối file).
3. `ADJUSTED`/`MISSING` → batch fix selector + chạy lại probe + chạy `npm test` (fixture phải cập nhật theo).
4. Chụp màn hình lưu `documents/AIMH-LOCAL/evidence/` theo tên step (U-…).
5. Ghi kết luận UAT vào RUN-LOG (SM điều phối).

---

## Appendix — Bản đồ truy vết nhanh

| Mục checklist | Truy vết | TC tương ứng |
|---------------|----------|--------------|
| Phần 0 | US-01 AC1, FR-GD1-01 | TC-401 |
| A1–A9 (45 probes) | FR-GD3-01..04, FR-GD5-01..03, BR-06/07, TDD §3.1/§7.5 | TC-409, TC-413, spike |
| B1–B4 | US-06, US-07, FR-GD3-04..07, FR-GD4-01..03, BR-10 | TC-408, TC-410 |
| B4, C410b | **BR-01** (no-Send) | TC-410, TC-121, TC-607 |
| B6–B8 | US-08, FR-GD5-01..05, BR-07/BR-09 | TC-413 |
| B9–B11 | US-09, FR-GD6-01..06, BR-02/BR-13 | TC-414 |
| B12, C407 | US-05, FR-GD2-09, BR-11, ERR-13 | TC-407 |
| D1–D4 | UC-03 EF-2/EF-4, FR-GD5-06 | TC-413 + TD-G5-2 |
| E1–E6 | FR-GD6-02/04, US-09, BR-13, BR-01 | TC-414 + TD-G6-4 |
| C501–C510 | FR-GD3-05, UC-01 AF-1/AF-4, UC-02 EF-5, ERR-02/08, UC-09, NFR | TC-501..510 |
