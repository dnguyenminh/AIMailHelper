# Plan: AIMailHelper — Browser Extension AI cho Outlook 365

> Ngày lập: 2026-10-13
> Trạng thái: Đã chốt scoping với user, chờ triển khai

## 1. Mục tiêu

Extension trình duyệt (Chrome/Edge, Manifest V3) chạy trên Outlook Web (OWA) để:

1. **Phân tích email** bằng AI: tóm tắt, mức độ quan trọng/khẩn cấp, ý định & hành động cần làm, deadline.
2. **Soạn trả lời tự động** (draft): AI sinh nội dung trả lời theo tone/ngôn ngữ người dùng chọn, điền vào khung Reply của Outlook — **người dùng tự xem/sửa/gửi**.
3. **Sàng lọc hộp thư (Triage)**: quét danh sách inbox đang hiển thị, chấm điểm quan trọng, badge + bảng Digest ưu tiên.
4. **Auto-mode (tùy chọn, mặc định TẮT)**: tự draft trả lời hàng loạt để người dùng duyệt.
5. **Trang cấu hình LLM**: chuyển đổi giữa nhiều provider (cloud + local).

## 2. Quyết định scoping (user đã xác nhận)

| Hạng mục | Quyết định |
|---|---|
| Trình duyệt | Chrome + Edge, Manifest V3 |
| Cách truy cập email | **Đọc DOM trang OWA** (content script), KHÔNG dùng Graph API |
| Tài khoản | Cả hai: Work/School (`outlook.office.com`, `outlook.office365.com`) và cá nhân (`outlook.live.com`) |
| LLM providers | OpenAI, Azure OpenAI, Anthropic, Gemini, OpenAI-compatible tùy chỉnh, Local LLM (Ollama/LM Studio preset) |
| Tech stack UI | React 18 + TypeScript + Vite (@crxjs/vite-plugin) |
| Ngôn ngữ | Song ngữ Việt/Anh, i18n có chuyển đổi |
| Phạm vi lần đầu | **Full 6 giai đoạn** |

## 3. Tech Stack

- **Manifest V3** extension, build bằng **Vite + @crxjs/vite-plugin**
- **TypeScript** strict mode toàn dự án
- **React 18** cho: options page, popup, panel AI inject vào OWA
- Panel inject qua **Shadow DOM** (mode: closed nếu được) để tránh xung đột CSS/style của Outlook
- LLM calls: **thuần `fetch`**, không dùng SDK nặng (giữ bundle nhỏ, dễ tùy biến per-provider)
- Streaming: `chrome.runtime.connect` Port messaging (MV3 service worker → content script)
- i18n: tự viết nhẹ (JSON dictionary `vi.json`, `en.json`), setting chọn ngôn ngữ trong Options

## 4. Cấu trúc dự án

```
AIMailHelper/
├── manifest.config.ts          # MV3 config (CRXJS)
├── vite.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── background/
│   │   └── service-worker.ts   # Message router + gọi LLM + điều phối storage
│   ├── content/
│   │   ├── index.tsx           # Entry point trên các domain OWA
│   │   ├── owa-adapter/        # ⚠️ Kiến trúc self-healing 3 tầng (xem mục 6)
│   │   │   ├── detector.ts     # Nhận diện layout OWA (reading pane, list view, compose box)
│   │   │   ├── reader.ts       # Đọc email: subject, sender, recipients, body, thread
│   │   │   ├── actions.ts      # Mở reply box + điền draft (KHÔNG tự bấm Send)
│   │   │   ├── triage.ts       # Đọc danh sách inbox đang hiển thị (GĐ 5)
│   │   │   ├── selectors.ts    # Tầng 1: multi-strategy selectors (role/aria-label/data-*)
│   │   │   ├── a11y-tree.ts    # Tầng 2: sinh accessibility tree snapshot + ref ID map (WeakRef)
│   │   │   ├── semantic-locator.ts # Tầng 2: gửi a11y tree cho LLM định vị phần tử, cache kết quả
│   │   │   ├── locator-cache.ts    # Cache mapping (chức năng → selector/ref) theo phiên bản layout
│   │   │   ├── vision-fallback.ts  # Tầng 3: captureVisibleTab → nén → vision LLM → elementFromPoint
│   │   │   └── diagnose.ts     # Log cấu trúc DOM/a11y tìm thấy để debug khi MS đổi UI
│   │   ├── components/         # Panel AI, nút hành động, badge (React trong Shadow DOM)
│   │   └── modules/
│   │       ├── analyze.ts      # GĐ 3: phân tích email đang mở
│   │       ├── reply.ts        # GĐ 4: sinh draft trả lời + điền vào compose box
│   │       └── digest.ts       # GĐ 5: quét inbox, chấm điểm, hiển thị Digest
│   ├── options/                # Trang cấu hình (React)
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ProviderForm.tsx      # Form per-provider (key, baseURL, model, api-version…)
│   │   │   ├── ModelPicker.tsx       # Dropdown fetch từ API models + ô nhập tay
│   │   │   ├── TestConnection.tsx    # Nút "Kiểm tra kết nối" + hiển thị latency
│   │   │   ├── PromptSettings.tsx    # System prompt tùy chỉnh, tone mặc định, ngôn ngữ trả lời
│   │   │   ├── AutomationSettings.tsx # Auto-mode toggle (mặc định OFF), giới hạn
│   │   │   └── GeneralSettings.tsx   # Ngôn ngữ UI, nơi lưu key (sync/local), privacy note
│   ├── popup/                  # Trạng thái nhanh: provider đang dùng, bật/tắt, link mở Options
│   ├── shared/
│   │   ├── llm/
│   │   │   ├── types.ts        # LLMConfig, ChatMessage, LLMResponse, ProviderId
│   │   │   ├── adapters/
│   │   │   │   ├── openai.ts            # Cũng là nền cho openai-compatible
│   │   │   │   ├── openai-compatible.ts # Base URL tùy chỉnh (OpenRouter, vLLM, proxy…)
│   │   │   │   ├── azure.ts             # Endpoint + deployment + api-version
│   │   │   │   ├── anthropic.ts         # + header anthropic-dangerous-direct-browser-access
│   │   │   │   ├── gemini.ts            # generativelanguage.googleapis.com v1beta
│   │   │   │   └── local.ts             # Preset Ollama :11434 / LM Studio :1234 (openai-compatible)
│   │   │   ├── registry.ts     # Map ProviderId → adapter instance
│   │   │   └── prompts.ts      # System prompts: analyze / reply / triage (vi + en)
│   │   ├── storage.ts          # Typed wrapper chrome.storage (sync cho config, local cho cache)
│   │   ├── messaging.ts        # Typed request/response + Port streaming
│   │   ├── i18n/
│   │   │   ├── index.ts
│   │   │   ├── vi.json
│   │   │   └── en.json
│   │   └── types.ts            # EmailData, AnalysisResult, ReplyDraft, TriageScore…
```

## 5. LLM Provider Layer

### Interface thống nhất

```ts
interface LLMAdapter {
  id: ProviderId;
  chat(config: LLMConfig, messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse>;
  chatStream(config: LLMConfig, messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
  listModels(config: LLMConfig): Promise<string[]>;
  testConnection(config: LLMConfig): Promise<{ ok: boolean; message: string; latencyMs: number }>;
}
```

### Chi tiết từng provider

| Provider | Endpoint | Cấu hình cần | Ghi chú kỹ thuật |
|---|---|---|---|
| OpenAI | `api.openai.com/v1/chat/completions` | API key, model | CORS OK từ browser |
| Azure OpenAI | `https://<res>.openai.azure.com/openai/deployments/<dep>/chat/completions?api-version=…` | Endpoint, deployment name, api-version, key | Không có listModels → nhập tay |
| Anthropic | `api.anthropic.com/v1/messages` | API key, model | Header `anthropic-dangerous-direct-browser-access: true` |
| Gemini | `generativelanguage.googleapis.com/v1beta/models/<m>:generateContent` | API key, model | Streaming qua `:streamGenerateContent?alt=sse` |
| OpenAI-compatible | Base URL tùy chỉnh | Base URL, key (tùy chọn), model | OpenRouter `/api/v1/models`, vLLM, proxy công ty |
| Local LLM | Ollama `localhost:11434`, LM Studio `localhost:1234` | Preset 1-click + chỉnh URL | Ollama cần env `OLLAMA_ORIGINS=chrome-extension://*` — hiển thị hướng dẫn trong Options; list models qua `/api/tags` |

### Lưu trữ & bảo mật

- API key: mặc định `chrome.storage.sync` (tiện đa máy), tùy chọn "chỉ lưu máy này" → `chrome.storage.local`
- MV3 CSP: **không remote code**, toàn bộ bundle cục bộ
- Host permissions: 3 domain OWA + các domain LLM provider (cân nhắc `optional_host_permissions` cho provider tùy chỉnh)
- Privacy note trong Options: email data chỉ gửi tới endpoint LLM người dùng tự cấu hình

## 6. OWA Adapter — Kiến trúc self-healing 3 tầng

Nền tảng nghiên cứu (2026): các framework browser-agent hàng đầu (browser-use, Stagehand v4, Skyvern, Playwright MCP, Claude in Chrome) đều hội tụ về nguyên tắc **"structure beats pixels"** — đọc trang bằng accessibility tree làm chính, vision chỉ làm fallback. Không framework nào trong số đó nhúng trực tiếp vào extension MV3 được (Python/Node dependency, quyền `debugger`, license), nhưng pattern của họ tái tạo được thuần TypeScript — chính Claude in Chrome (extension chính thức của Anthropic) đã chứng minh.

### Tầng 1 — Selectors nhanh (fast-path, miễn phí)
- Multi-strategy selectors: `[role=…]` → `aria-label` (hỗ trợ cả label EN/VN) → fallback cấu trúc tree
- Là đường chính cho mọi thao tác thường ngày: <1ms, không tốn token
- **detector.ts** nhận diện chế độ OWA: reading pane bên phải vs bật riêng vs conversation view

### Tầng 2 — AI định vị ngữ nghĩa (semantic locator) ⭐ trái tim của self-healing
1. `a11y-tree.ts` đi bộ DOM → sinh snapshot dạng text: `button "Reply all" (ref_12)`, `textbox "Search" (ref_3)`… mỗi phần tử có **ref ID bền vững** lưu trong WeakRef element map (pattern của Claude in Chrome — hành động qua ref ID, không qua tọa độ, tránh hoàn toàn lỗi Retina/hiDPI)
2. Khi tầng 1 thất bại → `semantic-locator.ts` gửi snapshot cho LLM đang cấu hình với câu hỏi ngữ nghĩa ("tìm nút Reply all", "tìm ô soạn thảo trả lời") → LLM trả về ref ID → thực hiện qua DOM element map
3. `locator-cache.ts` cache mapping (chức năng → selector/ref) kèm hash cấu trúc layout — khi layout chưa đổi thì không tốn token nào; khi MS cập nhật OWA, cache tự vô hiệu và tầng 2 chạy lại 1 lần
4. Chi phí: 1 call LLM nhỏ (chỉ text cây a11y, giới hạn max_chars, filter `interactive`) chỉ khi selectors gãy

### Tầng 3 — Vision fallback (tùy chọn, mặc định TẮT)
- `chrome.tabs.captureVisibleTab` → nén mạnh (target ~1568px, tham khảo pxPerToken≈28 của Claude in Chrome) → gửi ảnh cho vision LLM (Gemini/GPT-4o/Claude) → LLM định danh phần tử/vùng → click qua `elementFromPoint` + dispatch event
- Ép `deviceScaleFactor: 1` khi có thể (qua CDP nếu dùng Pro mode) để đồng bộ hệ tọa độ ảnh ↔ input — bài học Retina đắt giá của Claude in Chrome
- Bật/tắt trong Options + cảnh báo privacy rõ ràng: ảnh chụp màn hình email sẽ được gửi tới vision LLM
- Chỉ dùng khi tầng 1 + 2 đều thất bại (layout đổi lớn)

### Tùy chọn "Pro mode" — chrome.debugger + CDP (để Dedicated, sau MVP)
- Mở CDP trực tiếp từ service worker: `Accessibility.getFullAXTree`, `DOM.getDocument({pierce: true})` — xuyên qua cả **closed shadow DOM** (điểm mù của content script, cũng là bug đang mở của Claude in Chrome)
- Đánh đổi: banner "Chrome is being debugged" + thêm quyền `debugger` → review app store khó hơn
- Quyết định: không đưa vào MVP; thiết kế interface adapter sao cho có thể cắm sau

### Diagnose mode
- `diagnose.ts` log cấu trúc DOM/a11y tìm thấy được → hỗ trợ debug nhanh khi MS đổi UI, xuất báo cáo người dùng có thể gửi kèm bug report

## 7. Tính năng theo giai đoạn

### GĐ 1 — Scaffold
- Khởi tạo Vite + CRXJS + React + TS, manifest.config.ts (permissions, host_permissions 3 domain OWA)
- Popup + Options shell, storage.ts, messaging.ts, i18n framework, message router trong service worker
- **Deliverable**: extension load được qua "Load unpacked", popup/options hoạt động

### GĐ 2 — LLM Config
- 6 adapters + registry + streaming qua Port
- Options UI: chọn provider active, form cấu hình per-provider, model picker (fetch list khi có + nhập tay), nút Test Connection (hiển thị latency), chọn nơi lưu key
- **Deliverable**: chat test từ Options trả về kết quả streaming thành công cho đủ cả 6 loại provider

### GĐ 3 — Đọc & Phân tích email đang mở
- owa-adapter: detector + reader (subject, sender, to/cc, body, thread context)
- **Triển khai self-healing**: tầng 1 (selectors) từ GĐ 1 hoàn thiện; tầng 2 (a11y-tree + semantic-locator + locator-cache) hoàn thiện trong GĐ này; tầng 3 (vision-fallback) hoãn xuống sau GĐ 4
- Inject nút "AI phân tích" vào toolbar email + panel Shadow DOM bên cạnh
- Phân tích streaming: tóm tắt / độ quan trọng (score + nhãn) / ý định & hành động / deadline / cảm xúc
- Render kết quả có cấu trúc (badge màu theo mức độ)
- **Deliverable**: mở 1 email trong OWA → bấm phân tích → thấy kết quả trong vài giây

### GĐ 4 — Soạn trả lời AI
- Từ panel phân tích → nút "Soạn trả lời": chọn tone (chính thức/thân mật/ngắn gọn), ngôn ngữ (theo email gốc/bắt buộc VI/EN), hướng dẫn thêm (người dùng gõ yêu cầu riêng)
- Streaming sinh draft → hiện preview với nút "Chèn vào Reply" (điền vào compose box của OWA qua actions.ts) — **không tự bấm Send**
- **Hoàn thiện tầng 3 vision-fallback** (mặc định TẮT) + diagnose mode
- **Deliverable**: sinh và chèn draft trả lời thành công, người dùng edit + gửi bình thường

### GĐ 5 — Triage hộp thư
- triage.ts đọc danh sách email đang hiển thị trong inbox list
- Batch analyze (điều chỉnh batch size, có throttle + retry/backoff) → điểm quan trọng
- Badge màu trên list item + panel "Digest" liệt kê email ưu tiên với lý do
- Cache kết quả theo message-id trong chrome.storage.local (tránh tốn token khi quét lại)
- **Deliverable**: quét inbox hiện tại, badge + Digest hoạt động

### GĐ 6 — Auto-mode (mặc định TẮT)
- Setting bật/tắt rõ ràng + cảnh báo
- Khi bật: tự phân tích email mới đến (detect qua MutationObserver), tự draft trả lời cho nhóm email định sẵn (theo rule: sender, subject, mức độ), đưa vào **hàng chờ duyệt** — người dùng duyệt hàng loạt (Approve all / từng cái)
- **Deliverable**: luồng auto-draft → duyệt → chèn hoàn chỉnh

## 8. Thứ tự triển khai đề xuất

1. GĐ 1 (scaffold) → 2. GĐ 2 (LLM layer + options) → 3. GĐ 3 (đọc + phân tích) → 4. GĐ 4 (reply) → 5. GĐ 5 (triage) → 6. GĐ 6 (auto-mode)
- Sau GĐ 4 nên có 1 mốc kiểm thử thực tế trên cả outlook.office.com và outlook.live.com trước khi làm GĐ 5–6

## 9. Rủi ro & lưu ý

| Rủi ro | Giảm thiểu |
|---|---|
| MS thay đổi DOM OWA | Self-healing 3 tầng (mục 6): selectors → AI semantic locator (có cache) → vision fallback; cô lập trong owa-adapter; diagnose mode |
| Anthropic/LLM chặn CORS | Header riêng cho Anthropic; hướng dẫn OLLAMA_ORIGINS cho local |
| Token tốn khi triage | Cache theo message-id, chỉ quét phần hiển thị, batch size cấu hình được |
| Key lộ | Lưu storage Chrome (user-scoped), tùy chọn local-only, không log key |
| Auto-mode gửi nhầm | Mặc định TẮT, luôn qua bước duyệt của người dùng, không có code tự bấm Send |
| Vision fallback tốn token / privacy | Mặc định TẮT, nén ảnh mạnh, chỉ chạy khi tầng 1+2 thất bại, toggle + cảnh báo trong Options |
| Cache locator sai sau khi layout đổi | Cache gắn hash cấu trúc layout — đổi layout → tự vô hiệu, tầng 2 chạy lại |

## 10. Phụ lục — Nguồn nghiên cứu kiến trúc self-healing (2026-10)

| Nguồn | Bài học rút ra cho dự án |
|---|---|
| **Claude in Chrome** (Anthropic, extension MV3 thật) | A11y tree + ref ID (WeakRef) làm chính; hành động qua ref không qua tọa độ; ép deviceScaleFactor=1 trước khi screenshot; nén ảnh (pxPerToken≈28, max ~1568px); screenshot trong context liên tục gây nổ context 10x |
| **Stagehand v4** (Browserbase, MIT) | act/extract/observe; self-healing + action caching; kiến trúc v4 là MV3 extension chạy CDP qua chrome.debugger — chứng minh pattern khả thi nhưng không nhúng nguyên SDK được |
| **browser-use** (~114K⭐, MIT, Python) | Hybrid DOM/a11y-first + vision fallback đạt 89.1% WebVoyager — bằng chứng hướng lai thắng hướng vision thuần |
| **Skyvern** (AGPL) | Vision-first có chỗ đứng trên portal "chống bot" nhưng AGPL + Python platform → không phù hợp nhúng |
| **Playwright MCP** (Microsoft, Apache-2.0) | Chỉ dùng accessibility tree, không vision — "structure beats pixels" |

> Kết luận: không dùng framework ngoài; tái tạo pattern a11y-tree + semantic locator + cache + vision fallback trong `owa-adapter/` bằng TypeScript thuần.
