// scripts/patch-probe-aria.mjs — uat92: thêm probe aria-label vào probeNative (row-finder).
import { readFileSync, writeFileSync } from "node:fs";
const f = "src/content/owa-adapter/row-finder.ts";
let s = readFileSync(f, "utf8");
if (s.includes("ariaKey?: string): Element | null")) { console.log("đã patch trước đó — bỏ qua"); process.exit(0); }
const oldFn = "function probeNative(messageId: string): Element | null {\n  for (const attr of ID_ATTRIBUTES) {";
const newFn = [
  "function probeNative(messageId: string, ariaKey?: string): Element | null {",
  "  if (ariaKey !== undefined && ariaKey.length > 0) {",
  "    const hit = document.querySelector('[aria-label=\"' + attrValueSafe(ariaKey) + '\"]');",
  "    if (hit !== null) {",
  "      const row = rowOf(hit);",
  "      if (row !== null) return row;",
  "    }",
  "  }",
  "  for (const attr of ID_ATTRIBUTES) {"
].join("\n");
if (s.includes(oldFn) === false) { console.error("không thấy probeNative — cấu trúc file khác dự kiến"); process.exit(1); }
s = s.replace(oldFn, newFn);
s = s.replace(
  "  hint?: { subject: string; sender: string }\n): Promise<Element | null> {\n  const native = probeNative(messageId);",
  "  hint?: { subject: string; sender: string; ariaKey?: string }\n): Promise<Element | null> {\n  const native = probeNative(messageId, hint?.ariaKey);"
);
s = s.replace(
  "      if (hint.sender.length > 0 && item.sender === hint.sender) return row;",
  "      if (hint.sender.length > 0 && item.sender === hint.sender) return row;\n      if (hint.ariaKey !== undefined && row.getAttribute(\"aria-label\") === hint.ariaKey) return row;"
);
writeFileSync(f, s, "utf8");
console.log("✓ probeNative + findLiveRow đã thêm ariaKey");
