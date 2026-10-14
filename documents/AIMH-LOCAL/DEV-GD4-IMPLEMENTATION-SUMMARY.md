# DEV Implementation Summary — GĐ4 (AIMH-LOCAL, offline)

> dev-agent, 2026-10-15. Đối tượng: commits **b141e78** + **fc27e47** (branch AIMH-LOCAL, KHÔNG push remote).
> Kết quả kiểm chứng (CHẠY THẬT lần cuối 04:34 2026-10-15): **npm test 270/270 PASS (39 files)** · typecheck exit 0 · lint exit 0 · vite build exit 0 (gzip tổng ~70KB, chunk lớn nhất 51.7KB — Done #5 ≤1MB).

## ⚠️ Sự cố vận hành (báo cáo minh bạch)

Trong phiên này có **2 session DEV chạy song song** trên cùng workspace (session "re-launch" cũ theo STATUS #57 vẫn ghi file 12:11–02:02, session hiện tại ghi 04:20–04:28). Xử lý: **takeover + hợp nhất** — giữ contract của session cũ cho production (≈90% code), hợp nhất với thiết kế per-call opt-in + viết toàn bộ test GĐ4 (session cũ chỉ kịp reply.test.ts). Xung đột contract được resolve về MỘT trạng thái coherent (typecheck + 270 tests PASS trên trạng thái commit). Rủi ro ghi đè muộn đã chặn bằng commit ngay sau green.

## 3 CR đầu batch (điều kiện Done GĐ4)

| CR | Chứng cứ | File |
|----|----------|------|
| CR-A | PortServer.run() bọc set→invokeHandler→delete trong try/catch/finally — port disconnect giữa stream KHÔNG để orphan entry; test: postMessage throw từ send #2 (mock disconnect) → aborts.size === 0 | src/shared/port-server.ts · tests/llm/stream.handler.test.ts (describe "CR-A") |
| CR-B | OWA-DOM-SPIKE.md — checklist spike MANUAL: **38 probe/selector**, mọi dòng **UNVERIFIED**, đủ 8 nhóm (T1 chains ×11, SEND_BUTTON ×2, detector probes ×4, message-id S1/S2/S3 ×5, reader probes ×6, a11y-tree ×5, layout-hash ×4, deriveStructuralSelector ×1) + cột Selector/File/Giả định/Cách verify DevTools/Trạng thái + bảng build OWA chưa verify. KHÔNG bịa kết quả | documents/AIMH-LOCAL/OWA-DOM-SPIKE.md |
| CR-C | Audit rule biên DOM: document.querySelector|createElement|getElementById CHỈ trong owa-adapter/** + shadow-root.ts + Panel/** + options/popup main (DOM extension, deviation khai báo) + file test; vi phạm → fail. Kèm TC-121: (2) actions.ts chỉ export {openReplyBox, insertDraft}; (3) "send-button" chỉ trong selectors.ts (diagnose-only) | tests/audit.test.ts |
| TD-7 | TDD §7.5 amendment v1.2 + Revision History: S3 synthetic KHÔNG dùng sentAt-approx (hash subject\|sender\|preview-50) — SA-lite | documents/AIMH-LOCAL/TDD.md |

## Deliverable GĐ4

| File | Dòng | Nội dung |
|------|------|----------|
| src/content/owa-adapter/actions.ts | 61 | API DUY NHẤT compose: openReplyBox (locate reply-button → dispatch MouseEvent bubbles) + insertDraft (BR-10 blocked-empty → AF-1 mở reply nếu compose chưa mở → AF-5 needs-confirm kèm existing → writeText). InsertOutcome kind: inserted/needs-confirm/blocked-empty/compose-not-found/write-failed |
| src/content/owa-adapter/editable.ts | 58 | Ghi text React-an toàn: native setter prototype + dispatch input event (KHÔNG gán .value trực tiếp — React sẽ revert); contenteditable: execCommand insertText → fallback textContent + input event; append = cũ + "\n\n" + draft |
| src/content/owa-adapter/vision-fallback.ts | 118 | T3 opt-in (BR-03): điều kiện KÉP allowVision (per-call) + config.vision.enabled; capture QUA RPC VISION_CAPTURE (SW-side — CS không có chrome.tabs) → nén canvas 1568px JPEG 0.6 → VISION_LOCATE → parseVisionPoint fail-closed → elementFromPoint → verifyElement (SR-08). Ảnh KHÔNG persist (test assert storage dump không đổi) |
| src/content/owa-adapter/diagnose.ts | 134 | UC-09: probeAllChains (T1 hit/miss per FunctionKey) + a11y snapshot redact lần 2 (FUNCTIONAL_LABEL_PATTERN — label phi chức năng → "[redacted-label]") + send-presence đối chiếu + layoutHash + EF-3 privacy warning + EF-1 truncation 20K |
| src/content/modules/reply.ts | 185 | UC-02 orchestration: Port "reply" stream (rAF-gom) → preview; EF-5 so khớp messageId TRƯỚC chèn (mismatch → KHÔNG chèn tự động; insertAnyway bỏ qua so khớp — fix bug loop); ERR-09 (write-failed/compose-not-found) → error state giữ draft copy tay (EF-1); BR-10 lớp 2 |
| src/content/components/Panel/ReplySection.tsx | 123 | Tone/language selectors (mặc định theo CONFIG_GET prompts) + extraInstructions + preview streaming + Chèn (disabled khi draft rỗng — BR-10) + dialog AF-5 (replace/append/hủy) + warning EF-5 (Vẫn chèn/Hủy) + copy hint ERR-09 |
| src/content/components/Panel/DiagnoseView.tsx | 50 | Nút Diagnose → collectDiagnoseReport → textarea readonly + copy + cảnh báo EF-3 + đóng |
| src/content/components/Panel/Panel.tsx (sửa) | 84 | Wire ReplySection (email từ analyze getEmail()) + DiagnoseView |
| src/background/handlers/reply.handler.ts | 119 | Port kind "reply": validate (BR-14/BR-15, extra ≤1000) → buildChatMessages("reply", uiLanguage) + instruction block TONE/LANGUAGE/EXTRA (AF-4 auto) + serializeEmailData fence → chatStream temperature 0.7 (DEFAULT_TEMPERATURE.reply) |
| src/background/handlers/stream-utils.ts | 46 | streamToClient/sendError dùng chung (tách để file ≤200) |
| src/background/handlers/vision.handler.ts | 49 | RPC VISION_CAPTURE (gate BR-03 lớp 3 + captureVisibleTab WINDOW_ID_CURRENT jpeg quality 100) + VISION_LOCATE (adapter.chat visionImage, temp 0, maxTokens 64) |
| src/shared/llm/prompts-vision.ts | 51 | Vision prompt (vi/en) + ANTI_INJECTION_CLAUSE + mô tả phần tử per FunctionKey + "trả (x%, y%) hoặc null" |
| src/shared/llm/vision-wire.ts | 50 | **Deviation khai báo**: serialize visionImage theo wire format 3 họ provider (OpenAI image_url / Anthropic source base64 / Gemini inline_data) — ADDITIVE + GATED (chỉ khi opts.visionImage có mặt; behavior GĐ2 text-only KHÔNG đổi; 199 test cũ = regression guard). Lý do: ChatOptions.visionImage (FSD 5.1) chưa có serialization — T3 không thể hoạt động nếu không bổ sung |
| src/shared/messaging.ts (sửa) | +6 | +RPC kind VISION_CAPTURE/VISION_LOCATE |
| adapters (sửa, 5 file) | +2/file | Hook 1 dòng gọi vision-wire khi opts.visionImage (openai/azure/compatible/local inherits/anthropic/gemini) |
| tests/mocks/chrome.ts (sửa) | +2 | +windows.WINDOW_ID_CURRENT=-2 cho mock |
| i18n vi/en.json (sửa) | +26 keys | panel.reply.* (13) + panel.diagnose.* (7) + options.vision.* (3) + options.section.vision; keyset vi===en (156=156); I18N_DICTIONARY_SIZE=156 |
| src/options/** (sửa) | — | VisionSettings toggle (BR-03) + cảnh báo privacy EF-3 + useConfigData.setVision (CONFIG_SET section vision) |

## Test mới GĐ4 (+67; baseline 199 GĐ3 + 4 CR = 203)

| File | Số test | Phủ |
|------|---------|-----|
| actions.test.ts | 10 | BR-10, AF-1/AF-2, AF-5 (needs-confirm/replace/append), EF-2×2, ERR-09 write-failed, dispatch reply-button |
| editable.test.ts | 5 | native setter + input event, append, execCommand + fallback |
| vision-fallback.test.ts | 15 | **BR-03: 0 capture khi disabled; 0 capture khi không opt-in per-call**; happy path (1 capture, base64/mediaType), null/elementAt-miss/verify-fail (SR-08), không persist, parseVisionPoint fail-closed ×8 |
| diagnose.test.ts | 7 | **M-2: subject/sender KHÔNG xuất hiện**, label chức năng giữ, EF-3, send-presence, EF-1 truncation, EF-2 unknown, probeAllChains |
| reply.test.ts | 13 | stream→preview, EF-3/EF-4 giữ draft + retry, AF-3 cancel, **EF-5 mismatch KHÔNG chèn tự động + insertAnyway skip so khớp**, AF-5 passthrough, ERR-09 ×2 giữ draft, BR-10, dismissMismatch |
| reply.handler.test.ts | 5 | IT PortServer+PortClient: accepted→chunk→done + prompt fence/TONE/LANGUAGE/temp 0.7, AF-4 auto, tone sai ERR-15, BR-14 ERR-10, extra>1000 ERR-15 |
| vision.handler.test.ts | 5 | IT RPC: **BR-03 tắt → ERR-15 + 0 captureVisibleTab**; bật → 1 capture, không persist; VISION_LOCATE image_url data URL + temp 0 + maxTokens 64; sai payload ERR-15; chưa cấu hình ERR-11 |
| vision-wire.test.ts | 4 | wire format 3 provider + GATED no-op regression |
| prompts-vision.test.ts | 3 | SR-01 L1 clause, (x%,y%) instruction, vi/en + fallback |
| audit.test.ts (CR-C) | +3 | DOM boundary rule + TC-121 (2)(3) |

## Ràng buộc chứng cứ

- **BR-01 (no-Send)**: audit test PASS (pattern scan + TC-121 API surface + "send-button" diagnose-only); actions.ts chỉ {openReplyBox, insertDraft}; KHÔNG có đường code kích hoạt nút gửi OWA
- **BR-03 (T3 opt-in)**: 0 capture khi disabled (test CS + SW gate); điều kiện kép allowVision + config; Options toggle cảnh báo privacy (VisionSettings)
- **BR-10**: blocked-empty ở actions (lớp 1) + reply.ts (lớp 2) + nút disabled khi draft rỗng (lớp 3 UI)
- **AF-5**: needs-confirm kèm existing; KHÔNG ghi đè im lặng; dialog replace/append/hủy
- **EF-5**: mismatch → chỉ cảnh báo, KHÔNG chèn tự động; "Vẫn chèn" bỏ qua so khớp đúng 1 lần (currentIdSpy assert)
- **ERR-09/EF-1**: write-failed/compose-not-found → errors.insertFailed + giữ draft trong preview + copy hint; (EF-9 không có trong FSD UC-02 — hiểu là ERR-09, evidence tương ứng)
- **M-2**: diagnose redact — test assert subject/sender không xuất hiện trong report
- **SR-01 L3**: parseVisionPoint fail-closed (text lạ/ngoài 0-100 → null)
- **SR-10**: audit innerHTML PASS (đã fix 2 test file dùng innerHTML cleanup → replaceChildren)

## Deviations khai báo (cho TA review)

1. **vision-wire.ts + hook 1 dòng trong 5 adapter files** — GĐ4 bắt buộc (FR-GD4-05) vì ChatOptions.visionImage GĐ2 chưa serialize; gated additive, không đổi behavior text-only; 199 test cũ pass
2. **VISION_CAPTURE tách 2 RPC** (capture SW-side riêng) — CS không có chrome.tabs (MV3); kiến trúc đúng hơn giả định §3.1.3 (dispatch click/focus nằm ở actions layer, vision chỉ locate)
3. **Diagnose không đi qua facade locate()** — probeAllChains đọc T1 chain trực tiếp + snapshot (diagnose là công cụ quan sát, không phải luồng action); send-button presence chỉ hiện diện, không tương tác
4. **CR-C allowlist thêm options/popup main.tsx** — DOM của chính extension (mount root), không phải trang OWA
5. **Hợp nhất 2 session song song** — xem phần sự cố vận hành
6. **parseReplyPayload dùng prompt language = uiLanguage** (không phải reply language) — prompt base phải hiểu được; ngôn ngữ THƯ trả lời nằm trong instruction block (AF-4 auto). BR-11 giữ nguyên: reply language độc lập uiLanguage

## Hạn chế (báo cáo rõ)

1. **Manual OWA thật PENDING** — TC-408/410/411/412/415 = NOT_RUN theo kế hoạch offline; checklist verify trong OWA-DOM-SPIKE.md (38 probes UNVERIFIED, cả outlook.office.com và outlook.live.com) là điều kiện GĐ4-complete
2. Vision T3 chưa test trên model thật (cần provider hỗ trợ vision); canvas nén test qua seam inject (jsdom không có canvas 2d)
3. Anthropic listModels CORS spike (TD-8) vẫn carry sang GĐ5
