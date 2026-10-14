NHIỆM VỤ: Implement GĐ2 — LLM Config cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG push remote). Dự án: AIMailHelper — browser extension MV3. Working directory: C:\projects\nodejs\AIMailHelper. GĐ1 đã xong (commit 39c29ad): 25/25 tests pass, src skeleton hoàn chỉnh.

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/TDD.md v1.1 — §3.2 (LLM layer: 6 adapters + registry + sse.ts), §6.1 (RPC — connection.handler stub cần thay bằng thật), §6.2 Port streaming, §8.11 (Prompt Injection Mitigation — ANTI_INJECTION_CLAUSE + fence serialization), §11 checklist GĐ2 Done criteria
2. documents/AIMH-LOCAL/FSD.md v1.3 — mục 5.2.0–5.2.6 (API contracts chi tiết từng provider: endpoint, headers, request/response, SSE format, listModels, error mapping), 5.3.x (Port lifecycle heartbeat 20s — port-client.ts đã có từ GĐ1), 5.4.1 (storage)
3. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — items GĐ2: SR-03 (redactSecrets đa pattern — /sk-/AIza/hex32 + cấm serialize headers), SR-04 (privacy note key-sync qua Google), SR-05 (enforce https non-local — validateBaseUrl ĐÃ có trong storage-schema.ts, áp vào connection flow), SR-11 (auto-mode warning disclosure — chỉ copy i18n, toggle còn disabled), SR-18 (first-run consent banner — optional), DR-01 L1+L2 (ANTI_INJECTION_CLAUSE + fence — prompts.ts)
4. Code GĐ1 hiện tại: src/shared/llm/types.ts (interface only), src/shared/errors.ts (AppError ERR-01..16), src/shared/storage-schema.ts (validateBaseUrl SR-06 có sẵn), src/shared/messaging.ts, src/background/handlers/connection.handler.ts (stub → thay bằng thật), src/options/components/* (shells disabled → điền thật)

## Deliverable GĐ2 (theo TDD §11 GĐ2 Done criteria — "chat test từ Options trả về kết quả streaming thành công cho đủ cả 6 provider"):
1. **src/shared/llm/adapters/** — 6 adapters implement LLMAdapter interface (theo FSD 5.2.1–5.2.6):
   - openai.ts (chat + SSE + stream_options.include_usage + listModels /v1/models)
   - azure.ts (api-key header, KHÔNG có trường model trong body, content_filter handling, KHÔNG listModels → nhập tay)
   - anthropic.ts (transformation bắt buộc: system → top-level, max_tokens required default 2048, message đầu user; 4 headers gồm anthropic-dangerous-direct-browser-access: true; event content_block_delta; 529 overloaded; listModels /v1/models — spike CORS ghi chú)
   - gemini.ts (x-goog-api-key header KHÔNG ?key=, role "model", KHÔNG [DONE] marker, RetryInfo.retryDelay; 400 API_KEY_INVALID→ERR-02 vs INVALID_ARGUMENT→ERR-15 — DISC-2; listModels /v1beta/models)
   - openai-compatible.ts (tolerant parser: connection close = end, bỏ qua dòng JSON hỏng, apiKey optional, listModels tolerant {data[]}/{models[]})
   - local.ts (extends OpenAICompatible — preset ollama :11434 / lmstudio :1234; listModels /api/tags cho ollama, /v1/models cho lmstudio; KHÔNG Authorization; 403 → ERR-05 + hướng dẫn OLLAMA_ORIGINS)
2. **src/shared/llm/registry.ts** — Factory/Registry pattern: map ProviderId → adapter instance (getAdapter(id))
3. **src/shared/llm/prompts.ts** — system prompts analyze/reply/triage bản vi + en (6 prompts) + ANTI_INJECTION_CLAUSE (chèn vào cả 6) + serializeEmailData với fence EMAIL_OPEN/EMAIL_CLOSE + neutralize fence lồng (TDD §8.11 L2)
4. **src/shared/redact.ts** — redactSecrets() đa pattern (SR-03: sk-…/sk-ant-…/AIza…/hex32 → "[redacted]"); áp vào AppError message + logger + diagnose
5. **connection.handler.ts** — thay stub bằng thật: chat/testConnection/listModels qua registry + adapter; TEST_CONNECTION trả {ok, message, latencyMs}; lỗi qua AppError (i18nKey, KHÔNG chứa key — redactSecrets)
6. **Options UI điền thật** (6 component):
   - ProviderForm.tsx: form per-provider (key, baseUrl, model, api-version azure, preset local) — validate + lưu qua CONFIG_SET
   - ModelPicker.tsx: dropdown fetch listModels (khi có) + ô nhập tay LUÔN khả dụng; Azure ẩn nút fetch; lỗi fetch không chặn lưu (BR-17)
   - TestConnection.tsx: nút Test Connection + hiển thị {ok, message, latencyMs} + spinner ≤15s
   - PromptSettings.tsx: system prompt tùy chỉnh + tone mặc định + ngôn ngữ trả lời
   - AutomationSettings.tsx: toggle auto-mode (mặc định OFF BR-02) + confirm dialog + warning copy có disclosure "email mới tự gửi tới LLM" (SR-11) + batchSize/throttle config
   - GeneralSettings.tsx: đã có uiLanguage — THÊM keyStorage selector (sync/local — chuyển key qua KEY_STORAGE_SET xóa bản cũ BR-04) + privacy note đầy đủ (SR-04: key sync qua Google + email data chỉ tới provider cấu hình)
7. **Chat test từ Options** — panel/chat test streaming hiển thị kết quả (chat qua Port streaming — port-client đã có)
8. **Tests** — unit tests cho 6 adapters (mock fetch/SSE fixtures theo FSD 5.2.x): mỗi adapter test request shape + SSE parse + error mapping; registry test; redactSecrets test 4 fixtures key (SR-03); thêm vào số test hiện có

## Ràng buộc
- File ≤200 dòng, function ≤20 dòng, SOLID (Adapter + Factory/Registry + Strategy)
- SR-10: KHÔNG innerHTML/dangerouslySetInnerHTML (audit test đã chặn — giữ pass)
- KHÔNG hardcode key; key chỉ qua CONFIG_SET từ form; CONFIG_GET chỉ trả hasKey (BR-08)
- Streaming qua Port (port-client heartbeat 20s từ GĐ1 — tái sử dụng)
- i18n: mọi copy mới qua vi.json/en.json (keyset vi===en)
- CHẠY THẬT: npm test (tất cả pass), npm run typecheck, npm run build, npm run lint — BÁO KẾT QUẢ THẬT
- Commit cuối: "AIMH-LOCAL: GĐ2 LLM config — 6 adapters + registry + prompts (anti-injection) + Options UI thật + redactSecrets"

## Báo cáo khi xong
(1) danh sách file tạo/sửa + số dòng; (2) KẾT QUẢ THẬT test/typecheck/build/lint; (3) SR-03/04/05/11/18 + DR-01 L1/L2 áp dụng chứng cứ; (4) commit hash; (5) hạn chế (spike Anthropic CORS chưa chạy — ghi chú); (6) số test mới.