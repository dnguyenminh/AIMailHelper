NHIỆM VỤ: TA review implementation GĐ1 — AIMH-LOCAL (offline, KHÔNG Jira). Working directory: C:\projects\nodejs\AIMailHelper. GĐ1 scaffold đã xong (commit 39c29ad): 50 files ~2.770 dòng, 25/25 tests pass, build/typecheck/lint exit 0.

## Đầu vào
1. documents/AIMH-LOCAL/TDD.md v1.1 — §2 Architecture, §3 Component Design, §4.1 Package structure (chuẩn hóa cuối), §4.2 Key interfaces, §6.1 RPC router 9 kinds, §11 checklist GĐ1 Done criteria
2. documents/AIMH-LOCAL/FSD.md v1.3 — FR-GD1-01..08, BR-15 (enum validation), FR-GD2-09 (i18n fallback)
3. documents/AIMH-LOCAL/DEV-SECURITY-CHECKLIST.md — items GĐ1 (SR-07/10/12)
4. Code thực tế: src/**, tests/**, package.json, manifest.config.ts (git show 39c29ad để xem diff nếu cần)

## Checklist review (theo phase-5 Step 5c):
1. **Design conformance** — code bám TDD §4.1 package structure đúng cây? Router pattern (§2.4) đúng? Storage Facade (§3.3: area routing BR-04, migration schemaVersion, downgrade read-only) đúng? Shadow DOM closed (§2.3)?
2. **API contracts** — messaging.ts RpcKind ×9 + PortRequest/PortEvent khớp TDD §4.2/§6.1/§6.2 đúng signature? CONFIG_GET trả hasKey (KHÔNG apiKey — BR-08)?
3. **Integration** — manifest.config.ts: permissions/host_permissions/CSP đúng TDD §8.2/§8.3? service-worker lifecycle đúng MV3?
4. **Data model** — types.ts entities khớp FSD mục 4 + TDD §7.2 (KHÔNG keyStorage trong LLMConfig — DISC-1; PendingAutoDraft = QueueItem pending alias)?
5. **Patterns** — Router/Facade/Strategy/Observer/Repository dùng đúng như TDD §4.3 chỉ định?
6. **Deviations** — có lệch thiết kế không? justify được? (note: dev-agent dùng port-client.ts/port-server.ts tách 2 file từ messaging.ts — đánh giá chấp nhận được không theo nguyên tắc file ≤200 dòng)
7. **SR items GĐ1** — SR-07 (pin exact — verify package.json 0 range), SR-10 (0 innerHTML/dangerouslySetInnerHTML trong src/ — audit test có thật không), SR-12 (CSP tường minh + web_accessible_resources tối thiểu)
8. **Tests chất lượng** — 25 tests có test thật hành vi (không all-mock trivial)? storage migration test có test downgrade read-only? BR-01 invariant test đúng chỗ?

## Verdict: **APPROVED** hoặc **CHANGES REQUESTED** (list cụ thể từng file + thay đổi cần làm)
Nếu CHANGES REQUESTED → liệt kê chính xác, KHÔNG tự sửa code (dev-agent sẽ sửa).

## Quy tắc
- KHÔNG sửa code (chỉ review + verdict); KHÔNG Jira; KHÔNG Mermaid; KHÔNG DOCX
- Báo cáo ngắn gọn: bảng checklist ×8 + verdict + ghi chú nếu có