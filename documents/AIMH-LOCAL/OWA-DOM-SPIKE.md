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

## 6. Mail chưa đọc (unread heuristic — UAT 15/10)

- Row chưa đọc nhận diện bằng: aria-label chứa "unread"/"chưa đọc", hoặc nút con
  "Mark as read"/"Đánh dấu đã đọc" (chỉ xuất hiện trên row chưa đọc).
- Thu thập CHỈ ĐỌC DOM (không click/mở mail) nên KHÔNG đổi trạng thái đã đọc.
- ⚠️ Chưa verify trên mọi layout OWA — nếu miss row, bổ sung signal tại `isUnreadItem`.
