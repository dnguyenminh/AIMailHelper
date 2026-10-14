# DEV-GD3 Implementation Summary — Đọc & Phân tích email đang mở

> Ticket: AIMH-LOCAL (offline) · GĐ3 · TDD v1.1 §3.1/§5.3/§7.2/§7.5/§8.4/§8.11/§11 · FSD v1.3 6.2/6.6a–f/UC-01 · DEV-SECURITY-CHECKLIST M-1/M-2/SR-08/SR-09
> Commit: (điền sau khi commit) · Ngày: 2026-10-14

## 1. Files tạo mới (src)

| File | Dòng | Nội dung chính |
|------|------|----------------|
| src/content/owa-adapter/detector.ts | 47 | FR-GD3-01 — structural probe popout → conversation → reading-pane → unknown (outermost dedupe) |
| src/content/owa-adapter/reader.ts | 112 | FR-GD3-02 — subject/sender/to/cc/bodyText (normalize SR-10) + thread AF-1; **BR-14 gate ERR-10 tại reader** |
| src/content/owa-adapter/message-id.ts | 52 | §7.5 chain S1 attr → S2 regex AAMk → S3 synthetic SHA-256 trunc 16 hex (SR-09) |
| src/content/owa-adapter/a11y-tree.ts | 133 | **SR-02/M-2**: walker AND (INTERACTIVE_ROLES && hasMeaningfulLabel), bỏ fallback text-80, listitem/paragraph không xuất text; MAX_SNAPSHOT_CHARS 20.000, MAX_DEPTH 18; WeakRef map |
| src/content/owa-adapter/semantic-locator.ts | 151 | §5.3/6.6b — T1→cache→snapshot→LOCATOR_RESOLVE→deref→**verify SR-08**→derive selector→cache (#8); refId lạ → tier fail (SR-01 L3) |
| src/content/owa-adapter/locator-cache.ts | 51 | BR-06 — key `cache.locator.{functionKey}`, hash khác → null; **invariant #8: persist chỉ strategy="selector"**; evictStaleHashes |
| src/content/owa-adapter/layout-hash.ts | 44 | SR-09 — SHA-256 crypto.subtle; signature 3 cấp (tag+role) 4 vùng probe — KHÔNG hash nội dung email |
| src/content/owa-adapter/locator-expectations.ts | 58 | **SR-08** — expectation map đủ 6 FunctionKey; verifyElement(role+label) sau deref |
| src/content/modules/analyze.ts | 135 | UC-01 orchestration — readEmail → Port "analyze" → parse 6.6f fail-closed (EF-6); **AF-4 cancel khi đổi email**; rAF gom render |
| src/shared/analysis.ts | 133 | **M-1/SR-01 L3** — validateAnalysisResult caps (score 0..100 int, actions ≤10×200, summary/intent/sentiment ≤1000), toAnalysisResult extract JSON block, parseEmailPayload (BR-14 + shape) |
| src/shared/cache-store.ts | 53 | §4.1 bổ sung (file ≤200 — tách khỏi storage.ts) — typed wrapper chrome.storage.local cho cache.locator/triage |
| src/content/components/Panel/Panel.tsx | 68 | Panel GĐ3 — nút AI phân tích/Dừng/Soạn trả lời (disabled GĐ4) + **consent banner SR-18** + streaming + error |
| src/content/components/Panel/AnalysisView.tsx | 52 | FR-GD3-06 — 5 khía cạnh + badge màu theo importanceLabel |
| src/content/components/Panel/ErrorBanner.tsx | 17 | i18nKey + Thử lại (ERR-07) + EF-6 raw |

## 2. Files sửa

| File | Thay đổi |
|------|----------|
| src/content/owa-adapter/owa-adapter.ts | 63 dòng — facade: locate chuỗi đầy đủ (SemanticLocator), detectView/readEmail thật, **injectAnalyzeButton (FR-GD3-04, qua adapter)**; stub giữ nguyên GĐ4/GĐ5 |
| src/content/owa-adapter/selectors.ts | +FunctionKey/LocatorStrategy/SelectorTier canonical (phá vòng import owa-adapter⇄semantic-locator); chain giữ nguyên GĐ1 |
| src/shared/llm/prompts.ts | +kind "locate" (vi/en) — clause SR-01 tự chèn qua systemPrompt |
| src/background/handlers/locator.handler.ts | 60 dòng — thay stub: prompt locate (temperature 0, maxTokens 512) → chat → **parseRefId fail-closed** `/ref_\d+/` else null; snapshot >25K → ERR-15 tooLarge |
| src/background/handlers/stream.handler.ts | 109 dòng — +kind "analyze": parseEmailPayload (ERR-10 BR-14), buildChatMessages("analyze", uiLanguage, serializeEmailData fence), temperature 0.3; refactors streamToClient dùng chung |
| src/content/components/shadow-root.ts | +PANEL_BASE_CSS (actions/badge/error/consent/stream) |
| src/content/index.tsx | bootPanel + injectToolbar qua adapter (event `aimh:analyze`) |
| src/shared/i18n/{vi,en}.json | +19 keys panel.analyze.* (keyset vi===en, 110→130); I18N_DICTIONARY_SIZE=130 |

## 3. Tests (14 file mới, 92 test mới — tổng 199/199 PASS)

| File test | Phủ |
|-----------|-----|
| analysis.test.ts | M-1 caps (score 150 → REJECT, actions/summary/intent/sentiment/deadline), 6.6f extract, **TC-601 precursor**: injection prose → EF-6 null; parseEmailPayload BR-14 |
| a11y-tree.test.ts | **M-2 bắt buộc**: fixture chứa subject/sender/body → snapshot KHÔNG chứa text email; không fallback text-80; listitem không label → role+refId; caps 20K truncated; MAX_DEPTH; refId ổn định + resolve; refId lạ → null |
| detector.test.ts | 3 chế độ + unknown + ưu tiên popout |
| reader.test.ts | BR-14 ERR-10 (fetch 0 lần), S1/S2/S3, AF-1 threadContext, ERR-06 |
| message-id.test.ts | §7.5 chain + SHA-256 trunc 16 + ERR-12 fallback |
| layout-hash.test.ts | SR-09 determinism + vector "abc"; đổi cấu trúc → đổi; **đổi nội dung email → KHÔNG đổi**; label rename → không đổi (theo 6.6c tag+role) |
| locator-cache.test.ts | BR-06 hash mismatch → null; **invariant #8 persist chỉ selector**; evictStale chỉ giữ hash hiện tại; entry hỏng tự dọn |
| locator-expectations.test.ts | SR-08 map 6 key + verify role/label |
| semantic-locator.test.ts | §5.3 flow: T1 hit không chạm cache/LLM; T2 → refId → verify → cache selector; cache hit 0 LLM; hash đổi → LLM lại; **refId hallucinate → null**; compose-box nhận button (SR-08) → null; ERR propagate |
| modules/analyze.test.ts | state machine UC-01 + AF-4 cancel + EF-4 giữ raw + EF-6 |
| tests/llm/locator.handler.test.ts | RPC LOCATOR_RESOLVE: refId, temperature 0 + max_completion_tokens 512, quá cap ERR-15, chưa config ERR-11, 401 không lộ key; parseRefId fail-closed |
| tests/llm/analyze.handler.test.ts | IT Port analyze: accepted→chunk→done; prompt fence + clause; BR-14 ERR-10 fetch 0 lần; 401; cancel |

## 4. Deviations khỏi TDD (đã ghi chú trong code)

1. **FunctionKey/LocatorStrategy/SelectorTier chuyển canonical sang selectors.ts** — tránh vòng import owa-adapter ⇄ semantic-locator (RuntimeError "not a constructor"); re-export giữ nguyên API GĐ1.
2. **cache-store.ts tách khỏi storage.ts** — storage.ts đã 196/200 dòng; vẫn nguyên tắc Repository (typed wrapper duy nhất cho cache local) — ghi chú "TDD §4.1 bổ sung".
3. **layoutHash chỉ tag+role (đúng 6.6c)** — đổi label chức năng KHÔNG đổi hash; selector stale tự xử ở fromCache (querySelector miss → remove → T2 lại). Test ghi nhận quyết định này.
4. **resolveMessageId S3**: null chỉ khi CẢ subject+sender+preview rỗng (reader bodyText luôn khác rỗng nhờ BR-14) — ERR-12 fallback cứng dành cho triage GĐ5.
5. **LOCATE prompt** thêm kind thứ 4 vào prompts.ts (GĐ3 scope theo §6.1 #6) — clause SR-01 tự chèn (8 prompt tổng).
6. **injectAnalyzeButton**: nếu toolbar không thấy (pre-spike OWA thật) → bỏ qua im lặng, nút trong panel vẫn dùng được — determination spike GĐ4.

## 5. Hạn chế / Determination

- detector/reader probes + selector chains dựa trên pattern OWA phổ biến — **CHƯA test trên OWA thật (outlook.office.com/outlook.live.com)**. Spike bắt buộc trước GĐ4 Done (§11 GĐ4 + §15.2 #3): verify attribute/message-block probes thực tế.
- T3 vision-fallback + Diagnose + reply chưa cài (GĐ4) — locate fail hoàn toàn → ERR-06 qua caller.
- STREAM对话 analysis: A11ySource seam (Open Issue #7) chỉ DomA11ySource; CdpA11ySource để sau MVP.
