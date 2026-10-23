// scripts/trim-digest-comments.mjs — gọn comment digest.ts về ≤200 dòng (uat90).
import { readFileSync, writeFileSync } from "node:fs";
const f = "src/content/modules/digest.ts";
let s = readFileSync(f, "utf8");
s = s.replace(
  '  // uat80 — ↗ mở mail thành công → mail chuyển "đã đọc" → loại khỏi danh sách ngay.\r\n  markEntryRead',
  '  // uat80 — ↗ mở mail → "đã đọc" → loại ngay. uat90 — restore từ storage.\r\n  markEntryRead'
);
s = s.replace(
  '  // uat90 — khôi phục danh sách đã lưu (F5/restart không mất kết quả quét; chỉ khi idle).\r\n  restore',
  '  restore'
);
s = s.replace(
  '  // uat80 — refresh NHẸ danh sách chưa đọc (view đang mở, chu kỳ 30s): gộp mail mới về\r\n  // (chưa chấm điểm) + loại mail đã chuyển "đã đọc" (row còn kết nối). KHÔNG cuộn, KHÔNG LLM.\r\n  async refreshTop',
  '  // uat80 — refresh NHẸ (30s/lần khi view mở): gộp mail mới + loại mail đã đọc. Không LLM.\r\n  async refreshTop'
);
writeFileSync(f, s, "utf8");
console.log("done, lines:", s.split("\n").length);
