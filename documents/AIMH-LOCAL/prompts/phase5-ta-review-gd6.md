NHIỆM VỤ: TA review implementation GĐ6 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ6 Auto-mode xong (commits 17a748f + 4fe2712, diff 8229dad..17a748f): 352/352 tests (+33).

## Đầu vào
1. RUN-LOG #68 (dev-agent summary) + git diff 8229dad..17a748f
2. documents/AIMH-LOCAL/TDD.md v1.1 — §5.5 (auto-mode flow fail-closed), §8.6 (BR-02/BR-13), §7.4 (QUEUE_MAX 200), §6.1 (QUEUE_UPDATE chỉ approved|rejected), §11 GĐ6 Done criteria
3. documents/AIMH-LOCAL/FSD.md v1.3 — UC-07 (AF-5/EF-2/EF-4/EF-5), FR-GD6-01..06, BR-01/02/13
4. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — SR-11 (warning disclosure — GĐ2 đã có, xác nhận còn), SR-14 (br01-audit mọi GĐ)
5. Code: src/shared/queue-store.ts, src/content/modules/automode*.ts (5 files), src/background/handlers/queue.handler.ts, src/content/components/Panel/QueueView.tsx

## Checklist review ×9:
1. **BR-02 fail-closed** — sync() cổng duy nhất? enabled=false → observer KHÔNG đăng ký + 0 fetch (test)? KHÔNG tồn tại code path bật tự động (chỉ AutomationSettings + confirm)? observer hủy khi tắt?
2. **BR-13** — rules rỗng → chỉ analyze, spy draft=0? rule match đúng (senderPattern/subjectPattern case-insensitive/minImportance biên 69/70)?
3. **BR-01** — 0 code path tự Send (grep audit + TC-121 pass)? approve chỉ gọi insertDraft? QueueView noSend banner?
4. **QUEUE_MAX 200** — item 201 từ chối + cảnh báo? QUEUE_UPDATE chỉ nhận approved|rejected (giá trị lạ ERR-15)? prune approved bổ sung — chấp nhận được?
5. **UC-07 orchestration** — approve → chèn qua insertDraft; EF-5 mismatch giữ pending + cảnh báo; EF-2 chèn thất bại → về pending + ERR-09; AF-5 approve all một phần lỗi KHÔNG nuốt (failedIds tổng kết); reject loại khỏi hàng chờ?
6. **FR-GD6-06** — tắt giữ queue nguyên vẹn + observer hủy + 0 fetch? bật lại phục hiện?
7. **Storage pattern** — queue-store Repository đúng (không đụng chrome.storage ngoài storage.ts/cache-store pattern)? biome: queue ở local area đúng?
8. **Tests chất lượng** — +33 test thật (mutation observer fake, script Port events, QUEUE_MAX biên, AF-5 tổng kết)? file ≤200 (automode.ts 195)?
9. **i18n** — keyset vi===en 180? noSend banner + warning copy đúng SR-11 disclosure?

## Verdict: **APPROVED** / **APPROVED with warnings** / **CHANGES REQUESTED** (list cụ thể — KHÔNG tự sửa code)

## Quy tắc
KHÔNG sửa code; KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX. Báo cáo: bảng checklist ×9 + verdict + tech debt (ghi chú: hạn chế #2 EF-1 backoff thụ động và #3 detect email mới = reading-pane hiện tại — đánh giá có đúng TDD §5.5 scope không).