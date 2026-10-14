# OWA-DOM-SPIKE — Checklist verify selector trên OWA thật (AIMH-LOCAL, GĐ4 + GĐ5 triage)

> **Mục đích:** Đây là **checklist cho spike MANUAL** — user/QA chạy trên **OWA thật** ở mốc
> **GĐ4-complete** (TDD §11 Done #1: cả `outlook.office.com` và `outlook.live.com`; STC TC-410/TC-415)
> và **GĐ5** cho nhóm probe triage (#39–45; STC TC-413).
> **KHÔNG có kết quả verify nào ở đây** — mọi dòng đang ở trạng thái **UNVERIFIED**.
> Điền trạng thái sau khi verify: `PASS` (selector khớp) / `ADJUSTED` (đã sửa selector — ghi selector
> thay thế + commit) / `MISSING` (không tồn tại — cần strategy khác) vào cột Trạng thái.

## 0. Cách verify chung (DevTools)

1. Mở OWA tại **cả 2 domain**: `https://outlook.office.com` (work) và `https://outlook.live.com` (personal).
2. `Ctrl+Shift+I` → tab **Elements** → `Ctrl+F` dán selector cần verify (chỉ hỗ trợ substring — với
   attribute selector dùng tab **Console**).
3. Tab **Console**: `document.querySelectorAll("<selector>")` → xem `length` và phần tử trả về.
4. Rà **3 chế độ xem** cho probe đọc email: reading pane (đơn), popout window (cửa sổ riêng),
   conversation (nhiều email trong cùng thread).
5. Ghi chú: selector trùng nhiều phần tử → cần scope thêm; selector trống → marker `MISSING`.
6. Ghi tên build OWA (góc dưới Options → Version) + ngày verify vào cuối file.

## 1. Selector chain T1 — selectors.ts (SELECTOR_CHAINS)

| # | Selector | File | Giả định (pattern OWA phổ biến) | Cách verify trên OWA thật | Trạng thái |
|---|----------|------|--------------------------------|---------------------------|------------|
| 1 | `[role="main"] [aria-label*="Message" i]` | selectors.ts (reading-pane #1) | Vùng đọc email nằm trong `role=main`, block message có `aria-label` chứa "Message" (EN build) | Console trên email đang mở; test cả popout (không có role=main?) | UNVERIFIED |
| 2 | `[data-conversation]` | selectors.ts (reading-pane #2) | OWA gắn `data-conversation` cho container hội thoại | `document.querySelectorAll("[data-conversation]")` — đọc giá trị (id conversation?) | UNVERIFIED |
| 3 | `[role="main"] [role="toolbar"]` | selectors.ts (message-toolbar #1) | Toolbar hành động email là `role=toolbar` trong vùng đọc | Verify ở reading pane + conversation; đếm số toolbar trên trang | UNVERIFIED |
| 4 | `[role="toolbar"]` | selectors.ts (message-toolbar #2) | Toolbar không scope main (popout) | Có thể trùng toolbar khác (ribbon?) — kiểm tra phần tử đầu tiên có chứa Reply không | UNVERIFIED |
| 5 | `[aria-label*="Reply" i]:not([aria-label*="all" i])` | selectors.ts (reply-button #1) | Nút Reply có `aria-label` "Reply" (loại trừ "Reply all") | Hover nút Reply đọc tooltip/aria-label thực tế; kiểm tra "Reply all" có bị loại đúng không | UNVERIFIED |
| 6 | `[aria-label*="Trả lời" i]:not([aria-label*="Tất cả" i])` | selectors.ts (reply-button #2) | OWA UI tiếng Việt: label "Trả lời" / loại "Trả lời tất cả" | Đổi ngôn ngữ OWA sang VI rồi verify | UNVERIFIED |
| 7 | `[role="textbox"][aria-multiline="true"]` | selectors.ts (compose-box #1) | Compose box là contenteditable `role=textbox` + multiline | Mở Reply → verify phần tử chỉ có 1 khung soạn; kiểm tra cả search box có match lẫn không | UNVERIFIED |
| 8 | `[aria-label*="Compose" i][role="textbox"]` | selectors.ts (compose-box #2) | Compose box label chứa "Compose" | Đọc aria-label thật của khung soạn thảo (có thể là subject?) | UNVERIFIED |
| 9 | `[aria-label*="trả lời" i][role="textbox"]` | selectors.ts (compose-box #3) | Compose box UI tiếng Việt | Đổi ngôn ngữ OWA sang VI rồi verify | UNVERIFIED |
| 10 | `[role="list"]` | selectors.ts (inbox-list #1) | Danh sách thư là virtualized `role=list` | Xác định đúng list inbox (không phải list khác — folder pane?) | UNVERIFIED |
| 11 | `[role="listitem"]` | selectors.ts (inbox-item #1) | Mỗi email trong list là `role=listitem` | Scroll list ảo — xác nhận chỉ item hiển thị mới có trong DOM | UNVERIFIED |

## 2. Selector diagnose-only — SEND_BUTTON_SELECTORS

> ⚠️ Chỉ phục vụ UC-09 đối chiếu "có thấy nút Send không" trong báo cáo Diagnose. Extension không có
> đường code nào kích hoạt phần tử này (BR-01 — audit test bảo vệ).

| # | Selector | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|----------|------|----------|---------------------------|------------|
| 12 | `[aria-label*="Send" i]` | selectors.ts | Nút gửi thư OWA label "Send" (EN) | Mở compose → verify; ghi chú có phần tử nào khác trùng không | UNVERIFIED |
| 13 | `[aria-label*="Gửi" i]` | selectors.ts | Nút gửi thư OWA UI tiếng Việt "Gửi" | Đổi ngôn ngữ OWA sang VI rồi verify | UNVERIFIED |

## 3. Structural probe — detector.ts

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 14 | `[aria-label*="Message" i], [data-conversation]` (MESSAGE_PROBE) | detector.ts | Block message nhận diện qua label "Message" hoặc data-conversation | Verify ở cả 3 chế độ xem; đổi ngôn ngữ UI OWA → label còn "Message"? | UNVERIFIED |
| 15 | `[data-conversation]` (CONVERSATION_PROBE) | detector.ts | Conversation mode đánh dấu bằng data-conversation | Mở thread >2 email → probe trúng container đúng | UNVERIFIED |
| 16 | `[role="dialog"] [aria-label*="Message" i], [role="dialog"] [data-conversation]` (DIALOG_PROBE) | detector.ts | Popout window render trong `role=dialog` | Mở email trong popout → verify probe + `closest('[role="dialog"]')` trả đúng container | UNVERIFIED |
| 17 | `[role="main"] [aria-label*="Message" i], [role="main"] [data-conversation]` (MAIN_PROBE) | detector.ts | Reading pane nằm trong `role=main` | Verify ở reading pane; kiểm tra popout có role=main không | UNVERIFIED |

## 4. Message-id — message-id.ts (TDD §7.5)

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 18 | `[data-itemid]` | message-id.ts (S1 #1) | Item email mang ExchangeId trong `data-itemid` | Xem list item + container đọc email; ghi giá trị (có decode được ExchangeId không) | UNVERIFIED |
| 19 | `[data-convid]` | message-id.ts (S1 #2) | Id hội thoại trong `data-convid` | Xem list item khi conversation mode | UNVERIFIED |
| 20 | `[data-message-id]` | message-id.ts (S1 #3) | Biến thể đặt tên khác của MS giữa 2 domain | So sánh office.com vs live.com — tên attribute có khác nhau không | UNVERIFIED |
| 21 | href regex `(AAMk[A-Za-z0-9+/=]{20,})` | message-id.ts (S2) | Deep-link trong item chứa ExchangeId prefix "AAMk" | `document.querySelectorAll("a[href]")` trong item → tìm href chứa "AAMk"; ghi độ dài id | UNVERIFIED |
| 22 | S3 synthetic hash `subject\|sender\|preview-50` | message-id.ts | Không có id thật → hash nội dung (không dùng sentAt — TD-7 amendment v1.2) | Khi S1/S2 MISSING: xác nhận id synthetic ỔN ĐỊNH giữa re-render (đọc 2 lần) | UNVERIFIED |

## 5. Probe đọc nội dung — reader.ts

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 23 | `[role="heading"], h1, h2` (SUBJECT_PROBE) | reader.ts | Tiêu đề email là heading trong container | Verify heading trúng subject (không phải subject của email khác trong thread) | UNVERIFIED |
| 24 | `[aria-label*="body" i]` (BODY_PROBE) | reader.ts | Nội dung email trong block label chứa "body" | Verify label thật của khung nội dung ("Message body"?) + 2 ngôn ngữ UI | UNVERIFIED |
| 25 | `aria-label` prefix `From/Từ` | reader.ts (FROM_PATTERN) | Hàng người gửi là element với aria-label bắt đầu "From:"/"Từ:" | Đọc aria-label thật của hàng From (có dấu ":"? có tên + email?) | UNVERIFIED |
| 26 | `aria-label` prefix `To/Đến` | reader.ts (TO_PATTERN) | Hàng người nhận tương tự | Verify cả trường hợp nhiều người nhận (phân tách , ;) | UNVERIFIED |
| 27 | `aria-label` prefix `Cc` | reader.ts (CC_PATTERN) | Trường Cc (ẩn khi trống) | Verify email có Cc; email không Cc → 0 phần tử | UNVERIFIED |
| 28 | `[aria-label*="Message" i]` ≥2 block → thread | reader.ts (buildThreadContext) | Conversation có nhiều block message lồng nhau | Mở thread → verify thứ tự cũ→mới + excerpt đủ đọc | UNVERIFIED |

## 6. A11y snapshot — a11y-tree.ts (T2 locator)

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 29 | `role` attr + implicit role (button/link/textbox/main/article/input) | a11y-tree.ts | OWA dùng role ARIA đúng chuẩn cho control chức năng | So `role` attr với implicit qua Accessibility pane (DevTools → Elements → Accessibility) | UNVERIFIED |
| 30 | `aria-label` / `aria-labelledby` là label chức năng | a11y-tree.ts | Control chức năng có label riêng (Reply, Forward, Compose…) — KHÔNG chứa nội dung email | Chạy extension → bật console `[AIMH][locator]` → snapshot có chứa subject/body không (SR-02/M-2) | UNVERIFIED |
| 31 | `aria-hidden="true"` / style display:none → node ẩn | a11y-tree.ts (isHidden) | Node ẩn không xuất hiện trong snapshot | So số node snapshot với số control nhìn thấy | UNVERIFIED |
| 32 | `MAX_DEPTH 18` / `MAX_SNAPSHOT_CHARS 20000` | a11y-tree.ts | Cây OWA đủ trong giới hạn (không truncated thường trực) | Bật Diagnose → xem flag truncated; email dài → snapshot vẫn không cắt trước locator | UNVERIFIED |
| 33 | Shadow DOM không xuất hiện trong OWA chính | a11y-tree.ts (walk shadowRoot) | OWA hiện không dùng shadow root cho vùng chính | `document.querySelectorAll("*").forEach(e => e.shadowRoot && console.log(e))` | UNVERIFIED |

## 7. Signature cấu trúc — layout-hash.ts (BR-06 cache T2)

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 34 | `[role="toolbar"]` (region toolbar) | layout-hash.ts | Cùng probe #3 — dùng cho signature | Chuyển email khác → hash KHÔNG đổi (chỉ đổi khi cấu trúc đổi) | UNVERIFIED |
| 35 | `[role="list"]` (region list) | layout-hash.ts | Cùng probe #10 | Scroll list → hash ổn định (virtualization không đổi signature?) | UNVERIFIED |
| 36 | `[aria-label*="Message" i], [data-conversation]` (region reading) | layout-hash.ts | Cùng probe #1/#2 | Đổi email → hash giữ nguyên (BR-06 — cache còn hiệu lực) | UNVERIFIED |
| 37 | `[role="textbox"][aria-multiline="true"]` (region compose) | layout-hash.ts | Cùng probe #7 | Đổi role compose box (mock) → hash đổi → cache tự vô hiệu | UNVERIFIED |

## 8. Selector suy ra từ T2 — semantic-locator.ts

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 38 | `tag[role="…"][aria-label="…"]` 4 cấp (deriveStructuralSelector) | semantic-locator.ts | Path structural unique ≤4 cấp đủ nhận diện lại element sau reload | Sau cache hit → element đúng (không trúng phần tử khác); label chứa ký tự đặc biệt escape đúng | UNVERIFIED |

## 9. Triage — triage.ts (GĐ5 — BR-07/FR-GD5-01..03; EF-2/EF-4; AF-5)

> GĐ5 thêm 7 probe cho luồng triage (quét inbox ĐANG HIỂN THỊ + badge + folder guard). Chain
> inbox-list/inbox-item trùng probe #10/#11 — ở đây verify ĐỘ PHỦ riêng cho triage (scope trong
> list, virtualization, folder switch).

| # | Probe | File | Giả định | Cách verify trên OWA thật | Trạng thái |
|---|-------|------|----------|---------------------------|------------|
| 39 | `[role="listitem"]` scope BÊN TRONG `[role="list"]` (list.querySelectorAll) | triage.ts (collectInboxItems) | Tất cả email đang hiển thị là listitem con của list inbox — item ngoài list (khác) không bị quét (BR-07) | Console: so số listitem trong list với số email hiển thị; kiểm tra không có listitem nào ngoài list bị đếm nhầm | UNVERIFIED |
| 40 | `[role="heading"], h1, h2` BÊN TRONG listitem (subject probe) | triage.ts (readItem) | Subject email trong list nằm trong heading của listitem | Verify subject đọc đúng từng row; trường hợp row có 2 heading (thread)? | UNVERIFIED |
| 41 | `[aria-label]` prefix `From/Từ` BÊN TRONG listitem (sender probe) | triage.ts (firstLabeled) | Hàng người gửi trong list có aria-label "From: …"/"Từ: …" như reading pane | Đọc aria-label thật của hàng From trong list item (có "Từ:" bản VI?) | UNVERIFIED |
| 42 | S1 `[data-itemid]`/`[data-convid]`/`[data-message-id]` TRÊN LISTITEM (khác container đọc email) | triage.ts + message-id.ts | List item mang ExchangeId ở cấp row (không chỉ ở reading pane) — so probe #18-20 | Xem list item có attribute id nào; id có khớp email khi click mở không | UNVERIFIED |
| 43 | Badge inject vào listitem (appendChild span .aimh-triage-badge) — không vỡ layout row | triage.ts (attachBadge) | appendChild span inline vào row OWA không phá flex/grid của row | Chạy triage thật → badge hiện góc phải row? Row có bị xuống dòng/vỡ không? | UNVERIFIED |
| 44 | Đổi folder → container `[role="list"]` bị THAY THẾ (folder signature = identity container) | triage.ts (hasFolderChanged) | Click folder khác → OWA render lại list container (element mới) — EF-2 dừng an toàn | Bắt điểm đầu quét → click folder khác giữa chừng → xác nhận container cũ disconnected hay bị reuse (nếu reuse → cần bổ sung signal) | UNVERIFIED |
| 45 | Virtualized scroll — item mới xuất hiện trong DOM sau cuộn; badge cũ có bị remove cùng row re-render không | triage.ts + AF-5 UC-03 | Cuộn → OWA mount/unmount row; badge gắn vào row có thể mất khi row re-render → quét lại gắn lại | Cuộn xuống → DOM có thêm listitem? Badge trên row cũ còn không sau khi cuộn ra-vào? | UNVERIFIED |

## 10. Việc cần làm sau spike (GĐ4-complete + GĐ5 triage)

1. Điền cột Trạng thái cho cả 45 dòng trên **cả 2 domain** (2 bảng riêng nếu khác nhau).
2. Selector `ADJUSTED`/`MISSING` → sửa `selectors.ts`/`detector.ts`/`reader.ts`/`message-id.ts`/`triage.ts` +
   cập nhật test fixture + ghi commit "spike OWA: …".
3. Chạy STC TC-408 (analyze) + TC-410/TC-411 (reply chèn) + TC-412 (vision) + TC-413 (triage badge/Digest)
   trên OWA thật → cập nhật TEST-REPORT (hiện tại TC-410/415 = NOT_RUN theo kế hoạch offline).
4. Xác nhận BR-01 trên thật: extension không bấm nút gửi OWA (quan sát DevTools khi chèn draft).

## Build OWA đã verify

| Domain | Build OWA (version) | Ngày | Người verify | Ghi chú |
|--------|--------------------|------|--------------|---------|
| outlook.office.com | — | — | — | CHƯA VERIFY |
| outlook.live.com | — | — | — | CHƯA VERIFY |
| outlook.office365.com | — | — | — | CHƯA VERIFY |
