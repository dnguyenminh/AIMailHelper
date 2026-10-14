NHIỆM VỤ: TA review implementation GĐ2 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ2 LLM Config xong (commit f720a7c): 18 file mới + 15 sửa, 94/94 tests, bundle ~67KB gzip.

## Đầu vào
1. documents/AIMH-LOCAL/DEV-GD2-IMPLEMENTATION-SUMMARY.md — dev-agent tự mô tả (4 deviations có chủ ý chờ bạn xác nhận)
2. documents/AIMH-LOCAL/TDD.md v1.1 — §3.2 (LLM layer), §6.1/§6.2, §8.11 (prompt injection), §11 GĐ2 Done criteria
3. documents/AIMH-LOCAL/FSD.md v1.3 — mục 5.2.0–5.2.6 (API contracts từng provider — NGUỒN SỰ THẬT), BR-04/08/15/17
4. documents/AIMH-LOCAL/TA-FOLLOWUP-GD1.md — 3 follow-up từ review GĐ1: D-3 (azure.apiVersion regex), D-4 (PortServer terminal event guard), khuyến nghị integration-lite test CONFIG
5. Code: git show f720a7c (diff), src/shared/llm/**, src/background/handlers/**, src/options/**

## Checklist review:
1. **API contracts conformance** — 6 adapters khớp FSD 5.2.1–5.2.6: OpenAI (max_tokens fallback logic + stream_options), Azure (api-key header, không trường model, content_filter), Anthropic (system→top-level, max_tokens 2048 default, 4 headers, content_block_delta, 529), Gemini (x-goog-api-key, role model, không [DONE], RetryInfo, 400 tách ERR-02/ERR-15), compatible (tolerant), Local (preset + /api/tags + 403 ERR-05 OLLAMA_ORIGINS)
2. **Streaming** — SSE parse tolerant đúng? Retry pre-first-chunk đúng (429 Retry-After / 1-2-4s / 5xx 2-4-8s / timeout 1 lần)? Post-chunk không retry?
3. **Prompt injection (DR-01)** — ANTI_INJECTION_CLAUSE trong cả 6 prompt? serializeEmailData fence + neutralize lồng đúng TDD §8.11?
4. **Security GĐ2** — SR-03 redactSecrets đa pattern + áp ở errmap/logger; SR-04 privacy note; SR-05 https non-local + permissions.contains trước fetch + request lúc lưu; BR-08 CONFIG không trả apiKey (check config.handler prefill phi nhạy cảm)
5. **Registry/Factory** — registry.ts pattern đúng, per-call config isolation (snapshot không đổi giữa call — có test)?
6. **TA follow-up GĐ1** — D-3 azure.apiVersion regex đã áp? D-4 PortServer terminal event guard đã áp? Integration-lite test CONFIG có?
7. **Tests chất lượng** — 69 test mới có test thật (request shape qua nthCall, SSE fixtures, error mapping) hay trivial?
8. **Deviations** — 4 deviations dev-agent khai báo (thêm base-adapter/call/errmap/permissions tách file; llm-runtime; ChatTest component; chrome mock bugfix) — chấp nhận được không?

## Verdict: **APPROVED** / **APPROVED with warnings** (warnings = tech debt list) / **CHANGES REQUESTED** (list cụ thể)
Nếu CHANGES REQUESTED → liệt kê chính xác, KHÔNG tự sửa code.

## Quy tắc
KHÔNG sửa code; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX. Báo cáo: bảng checklist ×8 + verdict + tech debt list nếu có.