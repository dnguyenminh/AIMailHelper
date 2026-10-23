// scripts/add-reload-i18n.mjs — thêm errors.reloadRequired vào vi/en (uat91).
import { readFileSync, writeFileSync } from "node:fs";
const pairs = [
  ["src/shared/i18n/vi.json", "Tiện ích vừa được nạp lại — hãy F5 trang Outlook rồi thử lại."],
  ["src/shared/i18n/en.json", "The extension was reloaded — please refresh the Outlook tab (F5) and try again."]
];
for (const [file, message] of pairs) {
  let s = readFileSync(file, "utf8");
  if (s.includes("errors.reloadRequired")) { console.log(file, "đã có — bỏ qua"); continue; }
  const anchor = '"errors.badRequest":';
  const at = s.indexOf(anchor);
  if (at < 0) { console.error("không thấy anchor trong", file); process.exit(1); }
  const insert = '"errors.reloadRequired": ' + JSON.stringify(message) + ',\n    ';
  s = s.slice(0, at) + insert + s.slice(at);
  writeFileSync(file, s, "utf8");
  console.log(file, "✓");
}
