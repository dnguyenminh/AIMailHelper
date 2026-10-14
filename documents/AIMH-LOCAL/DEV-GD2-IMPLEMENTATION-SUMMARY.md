# AIMH-LOCAL — GĐ2 Implementation Summary (cho TA review — KB offline)

> DEV agent, 2026-10-14. Commit **f720a7c**. Input: TDD v1.1 §3.2/§6.1/§6.2/§8.11/§11 + FSD v1.3 §5.2.0–5.2.6/§5.3.x/§5.4.1 + DEV-SECURITY-CHECKLIST GĐ2.

## 1. Files tạo mới (18)

| File | Dòng | Nội dung |
|------|------|----------|
| src/shared/redact.ts | 29 | redactSecrets đa pattern SR-03 (sk-/AIza/hex-32), sanitizeProviderMessage cap 500, redactConfig |
| src/shared/llm/sse.ts | 90 | parseSse (block \r?\n\r?\n, block cuối không separator vẫn xử lý), parseNdjson Plan B 5.2.6, safeJsonParse |
| src/shared/llm/errmap.ts | 62 | mapHttpToErr per provider (Gemini DISC-2, Azure content_filter, local 403, Anthropic 529), mapFetchError, finishReasonError, isMaxTokensUnsupported |
| src/shared/llm/call.ts | 88 | postJson/getJson + timeout combineSignal + retry pre-first-chunk (429 Retry-After→1/2/4s, 5xx 2/4/8s, Gemini retryDelay body), retryDelaysConfig test seam |
| src/shared/llm/prompts.ts | 116 | 6 system prompt vi/en + ANTI_INJECTION_CLAUSE (chèn cả 6 — DR-01 L1) + serializeEmailData fence + neutralize (L2) |
| src/shared/llm/permissions.ts | 47 | requestOrigin + ensureHostPermission ERR-14 (BR-05 §8.3) |
| src/shared/llm/base-adapter.ts | 124 | Template Method: chat/chatStream/testConnection chung, hooks buildRequest/extract*, CallContext per-call (concurrency-safe) |
| src/shared/llm/adapters/openai.ts | 89 | OpenAI + base: max_completion_tokens→fallback max_tokens, stream_options.include_usage, listModels filter |
| src/shared/llm/adapters/openai-compatible.ts | 96 | tolerant SSE (close=end, JSON hỏng bỏ qua), Authorization chỉ khi có key, listModels {data[]}/{models[]} id??name??model |
| src/shared/llm/adapters/azure.ts | 74 | api-key header, KHÔNG trường model, max_tokens, content_filter, listModels throw (BR-17) |
| src/shared/llm/adapters/anthropic.ts | 120 | transform system→top-level + đầu user + max_tokens 2048, 4 headers, content_block_delta, event error 529→ERR-16, listModels phân trang |
| src/shared/llm/adapters/gemini.ts | 104 | x-goog-api-key (KHÔNG ?key=), role model, systemInstruction, ?alt=sse không [DONE], SAFETY→ERR-15, listModels filter+strip |
| src/shared/llm/adapters/local.ts | 63 | extends Compatible: preset ollama :11434 (/v1/chat/completions, /api/tags) / lmstudio :1234/v1 (/models), 0 Authorization, 403→ERR-05 |
| src/shared/llm/registry.ts | 27 | Factory/Registry: createLLMRegistry + singleton llmRegistry |
| src/background/llm-runtime.ts | 48 | resolveActive (ERR-11), resolveRequestConfig (merge key stored — BR-08) |
| src/background/handlers/stream.handler.ts | 86 | chat-test qua Port: validate messages ERR-15 → resolveActive → chatStream → chunk/done/error event |
| src/options/useConfigData.ts | 88 | hook CONFIG_GET + helpers CONFIG_SET/KEY_STORAGE_SET + defaultDraftFor per provider |
| src/options/components/ChatTest.tsx | 115 | Chat test streaming qua PortClient (heartbeat 20s GĐ1), system = custom prompt + clause |

## 2. Files sửa (14)

manifest.config.ts (+4 host_permissions LLM cloud §8.3) · connection.handler.ts (thay stub — TEST_CONNECTION/LIST_MODELS thật) · config.handler.ts (section activeProvider; providers[].config phi nhạy cảm để prefill — BR-08 vẫn không trả apiKey; merge key khi form để trống) · service-worker.ts (wire stream handler) · port-server.ts (StreamContext + requestId + StreamEventBody) · types.ts (ProviderStatus.config) · llm/types.ts (ChatOptions.retryDelays) · i18n vi/en 51→110 keys (keyset vi===en) · App.tsx (state draft chung) · ProviderForm/ModelPicker/TestConnection/PromptSettings/AutomationSettings/GeneralSettings (điền thật) · tests/mocks/chrome.ts (connect({name}) object + postMessage defer microtask)

## 3. Deviations có chủ ý (đã ghi chú trong code, chờ TA xác nhận)

1. **CONFIG_GET trả thêm `providers[id].config` (phi nhạy cảm, không apiKey)** — cần để prefill form (BR-08 giữ nguyên: key không rời SW). Không có nó → user phải gõ lại model mỗi lần mở Options.
2. **CONFIG_SET thêm section `activeProvider`** — TDD §6.1 #2 không liệt kê; cần để ProviderForm đổi provider.
3. **Merge key ở SW** cho CONFIG_SET/TEST_CONNECTION/LIST_MODELS khi payload để trống — hệ quả trực tiếp của BR-08 (key không bao giờ quay về UI). TDD §6.1 #4 ví dụ payload có apiKey — vẫn hỗ trợ trường hợp đó (user gõ key mới → dùng key mới).
4. **Azure: form ẩn model, model ≡ deployment khi lưu** — LLMConfig.model vẫn required (validator GĐ1) nhưng body KHÔNG có trường model (5.2.2).

## 4. Hạn chế

- **Spike CORS listModels Anthropic CHƯA chạy** (Open Issue #2) — adapter đã implement pagination; UI hiển thị note CORS + lỗi fetch không chặn nhập tay. Cần verify thủ công trên browser thật.
- Heartbeat >2 phút (Done #1) + 6 provider thật (Done Deliverable) cần verify thủ công với account/server thật — unit/IT test dùng mock fetch + fixture SSE.
- SR-18 consent banner: i18n keys đã chuẩn bị (panel.consent.banner/ack) — render ở GĐ3 khi analyze khả dụng.
- KB/MCP code-intelligence offline (port 9181 refused, không có indexer script) — summary này là fallback cho TA review.
