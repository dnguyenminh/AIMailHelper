# TA Follow-up — GĐ1 Review (APPROVED 2026-10-14)

> Nguồn: TA review GĐ1 (commit 39c29ad). 3 follow-up items KHÔNG chặn GĐ1 — DEV áp trong batch fix ngay sau GĐ2 (hoặc trong GĐ3 nếu trùng scope). SA chốt D-2 trong lần cập nhật TDD tới.

## D-2 — SA chốt: luồng ghi uiLanguage (FSD UC-08 vs TDD §2.1)
- **Vấn đề:** FSD UC-08 Main Flow Step 2 chỉ định `storage.ts` lưu trực tiếp; TDD §2.1 quy định extension pages chỉ nói chuyện với SW qua RPC. 2 spec mâu thuẫn; code GĐ1 đi theo FSD (storage-direct).
- **Yêu cầu SA:** chọn 1: (a) sửa TDD §2.1 cho phép options page ghi `uiLanguage` qua storage wrapper (nhanh, giữ code); hoặc (b) đưa `setUiLanguage` qua CONFIG_SET RPC (khi đó i18n.test.ts cần wire router vào chrome mock).
- **Quyết định mặc định (nếu SA chưa kịp chốt trước GĐ3):** giữ (a) — ghi chú vào TDD §2.1 "ngoại lệ: uiLanguage ghi trực tiếp qua storage wrapper (FSD UC-08), các config nhạy cảm (key, keyStorage) BẮT BUỘC qua RPC KEY_STORAGE_SET/CONFIG_SET".

## D-3 — DEV (GĐ2 batch fix): azure.apiVersion regex format
- **Vấn đề:** TDD §8.8 yêu cầu azure.apiVersion format `\d{4}-\d{2}-\d{2}`; storage-schema.ts hiện chỉ requireNonEmpty.
- **Yêu cầu DEV:** thêm validation regex `^\d{4}-\d{2}-\d{2}$` cho `azure.apiVersion` trong storage-schema.ts (BR-15) + 1 test case sai format → reject.

## D-4 — DEV (GĐ2 batch fix): PortServer guard terminal event
- **Vấn đề:** PortServer.run: handler throw → chỉ console.error, client KHÔNG nhận terminal event → client treo đến guardian idle 30s (TDD §6.2 #3: done/error là message cuối bắt buộc).
- **Yêu cầu DEV:** wrap handler call trong try/catch → nếu throw VÀ chưa gửi event nào → gửi `{type:"error", ...}` terminal event trước khi kết thúc; + 1 test: handler throw → client nhận error event ngay (không treo).

## Khuyến nghị thêm (từ TA)
- Thêm 1 test integration-lite: wire MessageRouter vào chrome mock, test CONFIG_GET/SET end-to-end (mock đã hỗ trợ, chưa test nào dùng).
- TDD §6.1 ví dụ JSON TEST_CONNECTION còn sót `keyStorage` trong payload (leftover trước DISC-1) — SA dọn khi cập nhật TDD lần tới; DEV lấy interface §4.2 làm chuẩn.
