// scripts/trim-digest2.mjs — gọn thêm 1 dòng comment (digest.ts về ≤200).
import { readFileSync, writeFileSync } from "node:fs";
const f = "src/content/modules/digest.ts";
let s = readFileSync(f, "utf8");
s = s.replace(
  "  // uat80 — refresh NHẸ (30s/lần khi view mở): gộp mail mới + loại mail đã đọc. Không LLM.\r\n  async refreshTop",
  "  async refreshTop"
);
writeFileSync(f, s, "utf8");
console.log("lines now:", s.split("\n").length);
