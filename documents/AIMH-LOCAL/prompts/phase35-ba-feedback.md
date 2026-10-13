NHIỆM VỤ: Feedback loop BA↔SA (iteration 1) — cập nhật FSD v1.3 theo 3 discrepancy Low trong documents/AIMH-LOCAL/DISCREPANCY.md. Ticket AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper.

## Bối cảnh
SA đã tạo TDD v1 (documents/AIMH-LOCAL/TDD.md) và phát hiện 3 discrepancy mức Low khi đối soát FSD v1.2 ↔ thiết kế. SA đã chuẩn hóa TDD theo hướng đúng (TDD là nguồn sự thật kỹ thuật); FSD cần cập nhật cho nhất quán. Đọc DISCREPANCY.md để xem chi tiết từng mục.

## 3 fix cần áp dụng (chi tiết trong DISCREPANCY.md, phần "Recommended fix"):
1. **DISC-1**: Bỏ trường keyStorage khỏi LLMConfig (mục 4.2) — giữ duy nhất config.general.keyStorage làm canonical (khớp TDD §3.3, §6.3, §7.2). Thêm 1 dòng ghi chú tại LLMConfig: "keyStorage là setting toàn cục ở config.general (DISC-1 v1.3)". Rà mọi chỗ FSD tham chiếu LLMConfig.keyStorage → sửa về config.general.keyStorage.
2. **DISC-2**: Sửa bảng error mapping Gemini (mục 5.2.4): tách dòng 400 — "400 + API_KEY_INVALID → ERR-02" và "400 + INVALID_ARGUMENT (tham số request sai) → ERR-15" (khớp TDD §3.2 + §9).
3. **DISC-3**: Sửa mục 6.2 bảng bước self-healing: bước 1 = "Tầng 1 — selectors"; bước 2 = "Kiểm tra locator-cache (chỉ khi T1 fail)"; giữ nguyên BR-06/BR-12 (khớp thứ tự chuẩn T1 → cache → T2 → T3 ở TDD §3.1, §5.3 và FSD 6.6b).

## Việc bổ sung
- Cập nhật Revision History thêm dòng: "1.3 | 2026-10-14 | BA Agent | Feedback loop iter-1: áp 3 fix DISC-1/2/3 (đồng bộ TDD v1)"
- Cập nhật mục 13.3 Change Log nếu cần ghi chú thay đổi đồng bộ TDD
- KHÔNG đụng nội dung khác của FSD; KHÔNG sửa diagrams; KHÔNG Mermaid; KHÔNG Jira; KHÔNG DOCX

## Báo cáo khi xong
(1) từng fix đã áp dụng ở đâu (số dòng/section); (2) số chỗ tham chiếu keyStorage đã chuyển; (3) xác nhận Revision History đã thêm 1.3.