# OWA-DOM-SPIKE — Cấu trúc DOM thật của outlook.cloud.microsoft

> Nguồn: UAT thật 15/10/2026 (user test trên tài khoản FECREDIT) + Diagnose reports.
> Trạng thái các probe/selector: ✅ đã verify trên DOM thật · ⚠️ giả định chờ verify.

## 1. Domain

| Domain | Ghi chú |
|---|---|
| `outlook.cloud.microsoft` | ✅ **OWA MỚI** — domain chính user đang dùng (THÊM vào manifest 4 domain) |
| `outlook.office.com` / `outlook.office365.com` | ⚠️ OWA cũ — chains giữ làm fallback |
| `outlook.live.com` | ⚠️ cá nhân — chưa verify |

## 2. Anchor ổn định (id — KHÔNG class hash)

| Anchor | Vai trò |
|---|---|
| `#Skip to message-region` | ✅ **Vùng đọc email** — chứa TOÀN BỘ pane: subject + From/To + body (id có khoảng trắng → selector `[id="Skip to message-region"]`) |
| `#Skip to message list-region` | ✅ **Vùng danh sách mail CÓ THỂ CUỘN** (user cung cấp 18/10) — list-scroller.ts BFS tìm scroller bên trong region này |
| `#MainModule` | ✅ Root app OWA — cha của folders list + email list + reading pane |

## 3. Cấu trúc các vùng chính

### 3.1 Danh sách thư mục (folder tree)
- ✅ `role="treeitem"` ×73 (ref_59–131 trong Diagnose) — cây thư mục
- Selector: `[role="treeitem"]` (đã thêm vào inbox-item chain — dùng cho folder-scoped ops nếu cần)

### 3.2 Danh sách email (inbox list)
- ✅ `role="listbox"` chứa `role="option"` — **mỗi option = 1 email** (checkbox + "Flag this message" + sender/subject/preview)
- ✅ Đã HIT trên OWA thật: `inbox-list: [role="listbox"]`, `inbox-item: [role="option"]`
- ✅ UAT 18/10: option CHƯA ĐỌC có aria-label **bắt đầu bằng "unread"** (Diagnose: `aria:unread pegasystems your disput...`) — khớp `isUnreadItem` signal 1
- ⚠️ Option KHÔNG chứa heading (Diagnose HEADINGS=1, chỉ heading trong folder tree) — subject extract qua SUBJECT_PROBE có thể rỗng trên OWA mới → cần parse từ aria-label (backlog)
- Chain: `[id="Skip to message list-region"] [role="listbox"]` (mới, 18/10) → `[role="main"] [role="listbox"]` → `[role="listbox"]` → `[role="list"]` (OWA cũ fallback)
- User cung cấp thêm CSS path (class hash — KHÔNG dùng vì gãy khi MS rebuild):
  `#MainModule > div > div > div.q9iRC.css-243 > div > div > div.rRhzD.css-242.wzILN`

### 3.3 Reading pane (email đang mở)
- ✅ `#Skip to message-region` — CHỨA ĐỦ: subject + From/To + body
- ⚠️ Container aria-label "N messages" (conversation root, len 2213–5768) — trúng qua
  `[aria-label*="Message" i]` nhưng là conversation root (gồm cả ribbon lân cận tùy cấu trúc)
- ⚠️ **KHÔNG có iframe** (SPIKE: IFRAMES (0)) — body nằm trong top document
- ⚠️ DOM lồng sâu 30–50+ tầng → **MAX_DEPTH đã BỎ** (walker đi hết cây, cap 12K node + 20K chars)

### 3.4 Ribbon (toolbar Home tab)
- ✅ `[role="toolbar"]` — chứa "New/Delete/Reply/Reply all/Forward/Quick steps/Flag..."
- ⚠️ **CẨN THẬN**: T1 `message-toolbar` trúng RIBBON (không phải message toolbar) — reader đã
  sửa `largestTextChildExcludingToolbars` loại nhánh >5 button hoặc chứa "Quick steps"
- ⚠️ Toolbar injection TẮT (chèn DOM vào React OWA phá layout — UAT fix 2)

## 4. Reader hoạt động trên OWA mới (đã sửa)

```
locate("reading-pane") → [id="Skip to message-region"] HIT
→ extractBodyText: loại nhánh ribbon (>5 buttons / "Quick steps") → nhánh body thắng
→ subject fallback: [aria-label*=Subject] → [data-testid*=subject] → [placeholder*=Subject/Tiêu đề]
→ BR-14: bodyText rỗng → ERR-10
```

## 5. Còn UNVERIFIED (cần test tiếp)

- [ ] `reply-button` chain HIT — nhưng cần verify click/insert draft vào compose box
- [ ] `compose-box` MISS cả chain — compose box của OWA mới: tìm `[role="textbox"][aria-multiline]`
      trong reply form; cần test "Soạn trả lời → Chèn vào Reply"
- [ ] Conversation grouping: layout "conversation" — thread context buildThreadContext cần verify
- [ ] Đa tab/popout: [role="dialog"] probe — chưa gặp trên OWA mới
- [ ] Badge triage trên option rows: `attachBadge` cần verify hiển thị đúng

## 7. KẾT QUẢ SPIKE BROWSER-HARNESS (CDP thật — 18/10/2026)

> Cấu hình: Edge 155, outlook.cloud.microsoft, layout CONVERSATION, tab Focused.
> **Inbox: 1385 mail chưa đọc** (folder tree badge) — yêu cầu user "quét tất cả" là hợp lý.

### 7.1 Cơ chế virtualizer của OWA mới (quan trọng nhất)
- Danh sách mail chỉ render **~10-12 row** trong DOM; virtualizer **TÁI SỬ DỤNG node + gán lại
  aria-label** khi cửa sổ trượt → đếm row KHÔNG thay đổi, chỉ NỘI DUNG đổi.
- Scroller thật: `DIV.customScrollBar` — **SIBLING của listbox** (KHÔNG phải ancestor!), nằm
  trong `#Skip to message list-region`. Cold-start: `scrollHeight == clientHeight` (không có
  scroll space) — OWA **materialize không gian ảo LAZY** sau wheel tin cậy đầu tiên (sh 830 → 14129).
- **OWA CHỈ phản ứng với input TIN CẬY (isTrusted)**: `Input.synthesizeScrollGesture` (CDP) →
  window trượt ✓ (user xác nhận nhìn thấy); synthetic WheelEvent (untrusted) → BỎ TRỪ; gán
  `scrollTop` thuần code → st đổi nhưng window KHÔNG trượt ✗.
- Kết luận: **content script KHÔNG THỂ tự cuộn** — cần chrome.debugger (CDP Input = trusted).

### 7.2 API nội bộ của OWA (mimic theo yêu cầu user)
- Nạp list: `POST /owa/service.svc?action=FindItem&app=Mail` — gọi ĐÚNG 1 LẦN lúc bootstrap
  (toàn bộ items vào bộ nhớ; cuộn sau đó KHÔNG gọi thêm FindItem).
- FindFolder: body ĐẦY ĐỦ nằm trong header **`x-owa-urlpostdata`** (URL-encoded JSON) + POST rỗng;
  protocol EWS-JSON: `FindFolderJsonRequest:#Exchange` / `IndexedPageView` / `FolderId:#Exchange`.
- Replay KHÔNG có `authorization: Bearer` → **server TREO** (không 401). Bearer đến từ MSAL
  (`msal.cache.encryption` cookie) — reverse-engineer token flow = dễ vỡ + rủi ro bảo mật cao.
- ⟶ **Kết luận: mimic API KHÔNG khả thi** (Bearer MSAL). Chọn chrome.debugger trusted-scroll.

### 7.3 Hành động an toàn đã xác minh
- Wheel/gesture cuộn **KHÔNG mở mail, KHÔNG đổi trạng thái đã đọc** (logger event: chỉ
  wheel/scroll; không click, không keydown) ✓ giữ nguyên BR cứng.
- Click TAB (Focused/Khác) = đổi view, không mở mail — an toàn.

## 8. Plan A — AI phân tích attachment (18/10/2026)

> User duyệt: Word/Excel/Text/CSV **+ PDF**. Cap 3 file/email × 20K ký tự. KHÔNG áp dụng triage.

### 8.1 Cơ chế (đã verify trên trang thật)
- Preview attachment: `POST /owa/<user>/service.svc/s/GetAttachmentPdfPreview?id=<attId>` —
  OWA TỰ tải binary (auth của nó) rồi render (pdf → mspdfkit.wasm canvas).
- Menu attachment: Preview / Save to OneDrive / Copy — KHÔNG có download URL trực tiếp.
- ⟶ Chỉ cần "nghe trộm" bytes: chrome.debugger Network events (permission đã có cho
  trusted-scroll) + Network.getResponseBody.

### 8.2 Module
| File | Vai trò |
|---|---|
| `background/attachment-capture.ts` | Bắt Network response trong cửa sổ preview (cap 5 file × 3MB, lọc asset noise) |
| `shared/attachments/zip.ts` | ZIP tối giản (stored + deflate-raw qua DecompressionStream — 0 thư viện) |
| `shared/attachments/extract.ts` | docx (document.xml) · xlsx (sharedStrings + sheet) · txt/csv · pdf (pdf.js legacy lazy) |
| `content/owa-adapter/attachment-reader.ts` | Mở preview từng file (synthetic click an toàn) → collect → extract |
| `shared/llm/prompts.ts` | Ghép khối `ATTACHMENTS` vào <email-data> (fence-neutralized — chống injection) |

### 8.3 Hạn chế đã ghi nhận
- Preview mở bằng synthetic click — nếu OWA chặn untrusted click cho preview (chưa thấy),
  chuyển sang CDP click qua debugger session đã attach.
- jsdom test thiếu DecompressionStream → polyfill từ node:stream/web (runtime Chrome có sẵn).

## 6. Mail chưa đọc (unread heuristic — UAT 15/10)

- Row chưa đọc nhận diện bằng: aria-label chứa "unread"/"chưa đọc", hoặc nút con
  "Mark as read"/"Đánh dấu đã đọc" (chỉ xuất hiện trên row chưa đọc).
  ✅ Xác nhận thêm (Diagnose 18/10): row chưa đọc có aria-label BẮT ĐẦU bằng "unread".
- Thu thập CHỈ ĐỌC DOM (không click/mở mail) nên KHÔNG đổi trạng thái đã đọc.
- ⚠️ Chưa verify trên mọi layout OWA — nếu miss row, bổ sung signal tại `isUnreadItem`.
