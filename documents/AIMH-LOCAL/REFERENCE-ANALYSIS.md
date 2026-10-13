# Reference Analysis — AIMH-LOCAL

> Feature: **Self-healing OWA Adapter** (browser element location resilience) cho AIMailHelper — browser extension MV3 AI cho Outlook Web.
> Nguồn sự thật: PLAN.md (mục 6 + mục 10, đã chốt scoping với user ngày 2026-10-13).
> Phiên làm việc offline — không web search, không Jira; tài liệu này tổng hợp 100% từ PLAN.md.

## Pattern: Self-healing browser element location — "structure beats pixels"

Xu hướng hội tụ 2026 của các framework browser-agent hàng đầu: đọc trang bằng **accessibility tree làm chính**, vision chỉ làm fallback. Không framework nào nhúng trực tiếp vào extension MV3 được (Python/Node dependency, quyền debugger, license), nhưng pattern của họ tái tạo được thuần TypeScript — Claude in Chrome (extension chính thức của Anthropic) đã chứng minh.

### Reference 1: Claude in Chrome (Anthropic — extension MV3 thật)

- **Architecture:** Extension MV3 chính thức của Anthropic. Đọc trang qua accessibility tree làm chính; hành động thực hiện qua **ref ID** (WeakRef element map), không qua tọa độ pixel. Screenshot có kiểm soát: ép `deviceScaleFactor=1`, nén ảnh mạnh (pxPerToken ≈ 28, max ~1568px).
- **Key patterns:**
  - A11y tree + ref ID bền vững làm cơ chế định vị chính
  - Hành động qua ref ID — tránh hoàn toàn lỗi hệ tọa độ Retina/hiDPI
  - Nén ảnh mạnh trước khi gửi vision LLM
  - KHÔNG screenshot trong context liên tục — gây nổ context 10x
- **Strengths:** Chứng minh pattern khả thi ngay trong extension MV3 thuần; chi phí token thấp khi ưu tiên structure; là mô hình tham chiếu trực tiếp nhất cho AIMailHelper.

### Reference 2: Stagehand v4 (Browserbase, MIT)

- **Architecture:** Kiến trúc v4 là MV3 extension chạy CDP qua chrome.debugger; API act/extract/observe.
- **Key patterns:**
  - Self-healing + action caching
  - CDP qua chrome.debugger: Accessibility.getFullAXTree, DOM.getDocument({pierce: true}) — xuyên cả closed shadow DOM
- **Strengths:** Self-healing kèm cache hành động giúp giảm chi phí lặp lại; chứng minh kiến trúc MV3 khả thi. Hạn chế: không nhúng nguyên SDK được (dependency/license) — chỉ tái tạo pattern.

### Reference 3: browser-use (~114K sao, MIT, Python)

- **Architecture:** Hybrid DOM/a11y-first + vision fallback.
- **Key patterns:**
  - Kết hợp cấu trúc DOM + accessibility tree làm chính
  - Vision chỉ dùng làm fallback, không làm đường chính
- **Strengths:** Đạt 89.1% WebVoyager — bằng chứng định lượng rằng hướng lai (structure-first + vision fallback) thắng hướng vision thuần.

### Reference 4: Skyvern (AGPL)

- **Architecture:** Vision-first browser agent — screenshot + vision LLM định vị phần tử.
- **Key patterns:**
  - Vision-first pipeline
- **Strengths:** Có chỗ đứng trên các portal "chống bot" nơi a11y tree khó đọc. Hạn chế: AGPL + Python platform → không phù hợp nhúng vào extension.

### Reference 5: Playwright MCP (Microsoft, Apache-2.0)

- **Architecture:** MCP server điều khiển browser chỉ qua accessibility tree, không vision.
- **Key patterns:**
  - "Structure beats pixels" — chỉ dùng a11y snapshot + ref, bỏ hẳn vision
- **Strengths:** Đơn giản, bền vững trước thay đổi UI; xác nhận thêm xu hướng hội tụ của ngành.

## Patterns to adopt in our BRD/TDD:

- [ ] A11y tree snapshot + Ref ID (WeakRef element map) làm chính — hành động qua ref, không qua tọa độ (Claude in Chrome)
- [ ] Tầng 1 multi-strategy selectors làm fast-path: <1ms, không tốn token (role → aria-label hỗ trợ cả EN/VN → fallback cấu trúc tree)
- [ ] Tầng 2 semantic locator: gửi a11y tree dạng text (filter interactive, giới hạn max_chars) cho LLM chỉ khi tầng 1 gãy; cache mapping theo layout hash
- [ ] Cache locator tự vô hiệu khi layout hash đổi; tầng 2 chỉ chạy lại 1 lần sau mỗi lần layout đổi (Stagehand-style action caching)
- [ ] Tầng 3 vision fallback MẶC ĐỊNH TẮT: nén ảnh (pxPerToken ≈ 28, max ~1568px), định vị qua elementFromPoint + dispatch event; chỉ chạy khi tầng 1 + 2 đều thất bại
- [ ] Không screenshot liên tục trong context — tránh nổ context 10x (bài học Claude in Chrome)
- [ ] Không nhúng SDK ngoài (Python/Node dependency, license) — tái tạo pattern thuần TypeScript trong owa-adapter/
- [ ] Diagnose mode: log cấu trúc DOM/a11y tìm thấy được để debug khi MS đổi UI + xuất báo cáo kèm bug report
- [ ] (Deferred — sau MVP) Pro mode CDP qua chrome.debugger để xuyên closed shadow DOM; thiết kế interface adapter cắm được
