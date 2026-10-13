NHIỆM VỤ: DevOps Setup (Phase 4.5) — CI/CD pipeline cho ticket **AIMH-LOCAL** (offline — KHÔNG Jira, KHÔNG deploy, KHÔNG push remote). Dự án: AIMailHelper — browser extension MV3 AI cho Outlook Web. Working directory: C:\projects\nodejs\AIMailHelper. Git repo LOCAL (branch AIMH-LOCAL, chưa có remote — KHÔNG push).

## Đầu vào
1. documents/AIMH-LOCAL/TDD.md — tech stack (Vite + @crxjs/vite-plugin, React 18, TS strict, vitest), testing strategy, 6 GĐ checklist
2. PLAN.md — mục 3 tech stack, mục 7 giai đoạn
3. documents/AIMH-LOCAL/FSD.md — NFR mục 8 (bundle ≤1MB gz, v.v.)

## Nhiệm vụ 1 — CI/CD pipeline files (tạo thật, chạy được):
Tạo `.github/workflows/ci.yml` (GitHub Actions):
- Trigger: push + pull_request
- Jobs: (1) build — checkout, setup-node 20, npm ci, typecheck (tsc --noEmit), lint (eslint nếu có config), build extension (npm run build), upload artifacts dist/ (và zip extension cho release); (2) test — npm test (vitest run), upload test results; (3) matrix có thể chạy build trên node 20
- Lưu ý: pipeline phải trống rãi giờ (src chưa có) — dùng điều kiện `if: hashFiles('package.json') != ''` và bỏ qua fail-soft cho bước chưa tồn tại? KHÔNG — viết pipeline CHUẨN cho trạng thái đích (sau GĐ1 scaffold sẽ khớp), ghi chú trong DPG rằng pipeline chỉ xanh sau GĐ1
- Tạo `.github/workflows/release.yml` (skeleton): tag `v*` → build + zip + create GitHub Release draft (KHÔNG auto publish store)

## Nhiệm vụ 2 — Tạo documents/AIMH-LOCAL/DPG.md (Deployment Guide) theo documents/templates/DPG-TEMPLATE.md:
- Mục tiêu deploy: extension phát hành qua Chrome Web Store + Edge Add-ons (manual upload sau khi zip), dev flow: Load unpacked
- Môi trường: dev (localhost build watch), test (build + load unpacked trên Chrome/Edge + 2 domain OWA), prod (store release)
- Quy trình: version bump (package.json + manifest version) → build → zip → upload store → review store → publish; rollback: tạm ngưng distribution / publish bản cũ
- CI/CD pipeline mô tả (phần 1) + secrets cần cấu hình (không có secrets nhạy cảm — không cần API keys trong CI)
- Draw.io diagrams BẮT BUỘC (KHÔNG Mermaid) tại documents/AIMH-LOCAL/diagrams/: deployment-flow.drawio + .png (dev→test→prod flow), rollback-flow.drawio + .png (rollback khi release lỗi). Export PNG bằng draw.io CLI + vision self-check (tối đa 2 vòng fix), ghi THẬT trạng thái vào DPG
- Testing gates trước deploy: unit + integration + manual checklist OWA (tham chiếu STP)
- Rollback & contingency: extension không có server-side rollback — unlist/publish previous version; bảo vệ: no-Send guarantee (BR-01) làm rủi ro gửi nhầm bằng 0

## Nhiệm vụ 3 — Tạo documents/AIMH-LOCAL/RLN skeleton? KHÔNG — RLN (Release Notes) tạo ở Phase 7 sau khi code hoàn tất. Chỉ ghi chú trong DPG.

## Ràng buộc
- KHÔNG push git, KHÔNG tạo remote, KHÔNG chạy npm install toàn bộ (repo chưa có package.json — KHÔNG được init project scaffold; đó là việc của dev-agent P5)
- KHÔNG Jira, KHÔNG Mermaid, KHÔNG DOCX
- Tiếng Việt, thuật ngữ kỹ thuật tiếng Anh

## Báo cáo khi xong
(1) đường dẫn files tạo (workflows + DPG + 2 diagrams); (2) trạng thái export PNG thật; (3) ghi chú khi nào pipeline sẽ xanh.