NHIỆM VỤ: Viết User Guide (UG.md) cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG DOCX — SM sẽ export). Working directory: C:\projects\nodejs\AIMailHelper. GĐ1-6 code hoàn tất.

## Đầu vào BẮT BUỘC đọc trước
1. documents/AIMH-LOCAL/UG-TEMPLATE.md — theo cấu trúc
2. documents/AIMH-LOCAL/BRD.md — user stories (ngôn ngữ user-friendly)
3. documents/AIMH-LOCAL/FSD.md v1.3 — UI specs 5 màn + error matrix ERR-01..16 (user messages)
4. Code thực tế: src/options/components/* (6 section thật), src/popup/PopupApp.tsx, src/content/components/Panel/*, src/shared/i18n/vi.json (130+ keys — copy messages THẬT hiển thị user), manifest.config.ts (permissions thật)
5. documents/AIMH-LOCAL/DPG.md — installation (Load unpacked + store)
6. documents/AIMH-LOCAL/SECURITY-REVIEW.md — privacy notes (BR-05 key sync, OLLAMA_ORIGINS)

## Nội dung UG (documents/AIMH-LOCAL/UG.md) — theo template, TIẾNG VIỆT user-friendly (thuật ngữ kỹ thuật tối thiểu):
1. **Giới thiệu** — AIMailHelper là gì, 4 năng lực (phân tích / soạn trả lời / triage / auto-mode), nguyên tắc an toàn NỔI BẬT: "Extension KHÔNG BAO GIỜ tự gửi email — bạn luôn là người bấm Send"
2. **Cài đặt** — 2 cách: Load unpacked (developer mode, từng bước có截图 mô tả text) + cài từ store (khi phát hành); yêu cầu Chrome/Edge ≥114; tải dist/
3. **Cấu hình ban đầu (Quick Start)** — 5 bước: mở Options → chọn provider (6 loại, bảng so sánh: cần gì — OpenAI cần API key; Azure cần endpoint+deployment+api-version; Anthropic cần key + note header CORS; Gemini cần key; OpenAI-compatible cần baseUrl; Ollama/LM Studio cần chạy local + hướng dẫn OLLAMA_ORIGINS chi tiết) → nhập key → Test Connection (đọc kết quả ok/latency) → chọn model (fetch hoặc nhập tay) → lưu. Chọn nơi lưu key (sync qua Google vs chỉ máy này — SR-04 disclosure rõ). Chọn ngôn ngữ UI
4. **Sử dụng hàng ngày** — từng tính năng với ví dụ cụ thể: (a) Phân tích email: mở email → bấm AI phân tích → đọc panel 5 khía cạnh (giải thích từng khía cạnh + badge màu nghĩa gì); (b) Soạn trả lời: chọn tone (khi nào dùng loại nào) + ngôn ngữ + hướng dẫn thêm (ví dụ "nhấn mạnh deadline") → xem preview → Chèn vào Reply → TỰ sửa + gửi; (c) Triage: bấm quét → đọc badge + Digest (lý do từng email) → Quét tiếp khi cuộn; (d) Hàng chờ duyệt (auto-mode): bật (cảnh báo đầy đủ), xem hàng chờ, Approve/Reject/Approve all, tắt giữ hàng chờ
5. **Cấu hình nâng cao** — System prompt tùy chỉnh (ví dụ tốt/xấu), batchSize/throttle (khi nào chỉnh), Vision fallback (TẮT mặc định — bật khi nào + cảnh báo privacy ảnh gửi tới LLM), first-run consent
6. **Xử lý sự cố (Troubleshooting)** — bảng ERR-01..16 → nguyên nhân → cách xử lý (người dùng đọc được): ERR-01 CORS (provider chặn — thử khác), ERR-02 sai key (kiểm tra key), ERR-03 rate limit (chờ), ERR-04 timeout, ERR-05 local không chạy (OLLAMA_ORIGINS từng bước chi tiết cho Ollama + LM Studio), ERR-06 không định vị OWA (layout đổi — bấm Diagnose), ERR-07 stream đứt (thử lại — giữ phần đã nhận), ERR-08 storage đầy (dọn cache), ERR-09 không chèn được (copy tay), ERR-10 email rỗng, ERR-11 thiếu cấu hình, ERR-12 thiếu message-id, ERR-13 thiếu bản dịch, ERR-14 thiếu quyền host (cấp quyền), ERR-15 tham số sai, ERR-16 provider quá tải
7. **Câu hỏi thường gặp (FAQ)** — 10+ câu: API key của tôi lưu ở đâu/an toàn không? (chrome.storage + sync qua Google nếu chọn — chi tiết SR-04/BR-04) · Extension có gửi email hộ tôi không? (KHÔNG — BR-01) · Email của tôi đi đâu? (chỉ tới LLM provider bạn cấu hình — BR-05) · Tại sao quét inbox tốn tiền? (token — cache + cap 50 + chỉ phần hiển thị) · Ollama bị từ chối kết nối? (OLLAMA_ORIGINS) · MS đổi giao diện Outlook thì sao? (self-healing 3 tầng — giải thích đơn giản) · Auto-mode có tự gửi không? (KHÔNG — hàng chờ duyệt) · Tắt extension có mất cấu hình? (KHÔNG) · Xoá cache? · Báo lỗi (Diagnose report + privacy note)
8. **Bảo mật & quyền riêng tư** — tổng hợp: data flow (email → provider bạn chọn), key storage (sync/local), KHÔNG telemetry, KHÔNG remote code, vision opt-in, consent
9. **Phím tắt & mẹo** (nếu có — từ code)

## Ràng buộc
- Tiếng Việt thân thiện; KHÔNG jargon không giải thích; messages copy TỪ i18n vi.json (thật — không bịa UI text); KHÔNG Mermaid; KHÔNG Jira; KHÔNG DOCX; KHÔNG sửa code
- File lớn: stream_write_file hoặc write chunked hợp lý
- Đối chiếu code: mọi hướng dẫn phải khớp behavior thật (đọc component trước khi viết — không bịa nút không tồn tại)

## Báo cáo khi xong
(1) UG.md path + số dòng + số section; (2) số câu FAQ; (3) bảng ERR bao phủ đủ 16; (4) xác nhận mọi messages khớp i18n vi.json thật; (5) hạn chế.