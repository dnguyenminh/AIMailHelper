NHIỆM VỤ: TA review implementation GĐ4 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ4 Soạn trả lời AI + T3 vision + Diagnose xong (chưa commit — review working tree vs HEAD 36b39a9; orchestrator đã verify độc lập 04:17: typecheck 0 / test 203/203 / build exit 0 gzip 51.7KB).

## Đầu vào
1. Git diff working tree vs HEAD (git diff + git status — GĐ4 files: src/content/modules/reply.ts, owa-adapter/{actions,vision-fallback,diagnose}.ts, components ReplySection/DiagnoseView/VisionSettings, Panel.tsx, background reply.handler/stream.handler/stream-utils, messaging.ts)
2. documents/AIMH-LOCAL/TDD.md v1.1 — §3.1.3 (vision T3 opt-in), §3.1.5 (actions BR-01 no-Send 4 lớp), §5.2 (Reply Draft flow), §8.7 (vision opt-in điều kiện kép), §11 GĐ4 Done criteria
3. documents/AIMH-LOCAL/FSD.md v1.3 — UC-02 (Draft Reply), UC-09 (Diagnose), FR-GD4-01..08, BR-01/03/10
4. documents/AIMH-LOCAL/TA-REVIEW-GD2.md — tech debt list (TD-4 redact logger wire, TD-5 transient activation verify)
5. documents/AIMH-LOCAL/OWA-DOM-SPIKE.md — CR-B artifact vừa tạo (checklist UNVERIFIED)

## Checklist review ×10:
1. **3 CR GĐ3 fix**: CR-A port-server try/finally quanh aborts (orphan entry — có test port disconnect giữa stream?); CR-B OWA-DOM-SPIKE.md có thật + đủ probes (MESSAGE/DIALOG/MAIN_PROBE, data-conversation, data-itemid, AAMk regex, reply/compose chains) + trạng thái UNVERIFIED (KHÔNG bịa kết quả verify)?; CR-C audit rule biên DOM trong tests/audit.test.ts (document.* chỉ owa-adapter/shadow-root/Panel)?
2. **actions.ts BR-01** — 0 code path click nút Send (grep audit + API surface chỉ openReplyBox/insertDraft)? insertDraft: native setter + execCommand + dispatch input event cho React/OWA? draft rỗng chặn BR-10? compose có nội dung → needs-confirm AF-5 (không ghi đè im lặng)?
3. **reply.ts UC-02** — tone (3 loại) + ngôn ngữ (email gốc/VI/EN) + hướng dẫn thêm → reply prompt (fence + ANTI_INJECTION clause từ GĐ2)? stream qua Port → preview → Chèn vào Reply? so khớp messageId EF-5 (email đổi giữa chừng → cảnh báo, không chèn tự động)? ERR-09 → copy tay fallback?
4. **vision-fallback T3** — điều kiện kép (config.vision.enabled + per-call opt-in)? mặc định TẮT (BR-03 — 0 captureVisibleTab khi tắt — có test)? nén ~1568px? parse (x%,y%) → elementFromPoint + SR-08 verifyElement trước dispatch? KHÔNG persist ảnh?
5. **diagnose.ts M-2** — label chỉ giữ control chức năng, node khác "[redacted-label]"? body/subject/sender không xuất hiện trong report? cảnh báo privacy EF-3?
6. **SR-08/TD-5** — verifyElement trước dispatch trong T3? permissions.request transient activation (TD-5) — note hoặc fix?
7. **Tests** — +4 mới (199→203); GAP so mục tiêu ≥12 — đánh giá: có đủ cover các luồng chính (actions BR-10/AF-5, vision disabled, diagnose redact, reply flow) hay thiếu case quan trọng? liệt kê case thiếu (nếu có) thành đề xuất bổ sung
8. **i18n** — keyset vi===en sau khi thêm keys mới?
9. **File size** — mọi file ≤200 dòng?
10. **Done criteria GĐ4** (TDD §11): mốc kiểm thử OWA thật 2 domain — MANUAL PENDING (không thể tự động) — xác nhận OWA-DOM-SPIKE + STC evidence ghi đúng trạng thái, không tuyên bố "đã verify production DOM"?

## Verdict: **APPROVED** / **APPROVED with warnings** / **CHANGES REQUESTED** (list cụ thể — KHÔNG tự sửa code)

## Quy tắc
KHÔNG sửa code; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX. Báo cáo: bảng checklist ×10 + verdict + tech debt/gap list.