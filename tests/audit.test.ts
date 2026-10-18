// tests/audit.test.ts — source audit CI-style (DEV-SECURITY-CHECKLIST GĐ1: SR-10; TDD §12.3 br01-audit; BR-16).
// SR-10: 0 match dangerouslySetInnerHTML / .innerHTML = trong src/.
// BR-01: không tồn tại pattern "send ... click / click ... send" trong src/ (no-Send guarantee lớp 2, §8.5).
// BR-16: không eval / new Function; không API key hard-code (sk-… / AIza… hex-32).
// File ≤ 200 dòng (TDD §1.4 #7 — GĐ1 Done #5).
// CR-C (TA review GĐ3 — điều kiện Done GĐ4): biên DOM — document.querySelector/createElement/
// getElementById CHỈ được dùng trong owa-adapter/** + shadow-root.ts + Panel/** (shadow root của
// chính mình) + entry pages DOM của extension (options/popup main) + file test. Vi phạm → fail.
// TC-121 (STC GĐ4): BR-01 lớp 2/4 — API surface actions.ts CHỈ {openReplyBox, insertDraft};
// chuỗi "send-button" CHỈ xuất hiện trong selectors.ts (mục đích diagnose — UC-09).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

const SOURCES = collectFiles(SRC_ROOT).filter((file) => /\.(ts|tsx|css|html)$/.test(file));
const readAll = (): string =>
  SOURCES.map((file) => readFileSync(file, "utf8").replace(/\\n/g, "\\n")).join("\n");

const relative = (file: string): string => file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
const isTestFile = (file: string): boolean => /\.test\.tsx?$/.test(relative(file));

// CR-C — allowlist biên DOM (đường dẫn tương đối từ src/, dấu / chuẩn hóa).
// options/popup main là DOM CỦA CHÍNH extension (trang Options/popup, không phải trang OWA) —
// deviation được khai báo cho SM trong báo cáo GĐ4 (rule chữ nhật động sẽ fail sẵn 2 file GĐ1).
const DOM_API_PATTERN = /document\.(querySelector|createElement|getElementById)\b/;
const DOM_ALLOWED_PREFIXES = [
  "content/owa-adapter/", // biên DOM duy nhất tới trang OWA (§1.4 #2, TDD §3.1)
  "content/components/shadow-root.ts", // tạo shadow host + fallback <style>
  "content/components/Panel/", // querySelector trên shadow root của chính mình
  "options/main.tsx", // mount root trang Options (DOM extension)
  "popup/main.tsx" // mount root popup (DOM extension)
];
const domAllowed = (file: string): boolean =>
  isTestFile(file) || DOM_ALLOWED_PREFIXES.some((prefix) => relative(file).startsWith(prefix));

describe("source audit (GĐ1 — SR-10 / BR-01 / BR-16 / size limit)", () => {
  it("SR-10: 0 match dangerouslySetInnerHTML và .innerHTML trong src/", () => {
    expect(readAll()).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=/);
  });

  it("BR-01: không tồn tại pattern trigger nút Send trong src/", () => {
    expect(readAll()).not.toMatch(/send[\s\S]{0,30}click|click[\s\S]{0,30}send/i);
  });

  it("BR-16: không eval / new Function trong src/", () => {
    expect(readAll()).not.toMatch(/\beval\s*\(|new\s+Function\s*\(/);
  });

  it("không hard-code API key trong src/ (sk- / AIza / hex-32)", () => {
    expect(readAll()).not.toMatch(/sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|\b[0-9a-fA-F]{32}\b/);
  });

  it("GĐ1 Done #5: mọi file src/ ≤ 200 dòng", () => {
    const offenders = SOURCES.filter((file) => readFileSync(file, "utf8").split("\n").length > 200);
    expect(offenders).toEqual([]);
  });

  // CR-C (TA review GĐ3): biên DOM — API DOM toàn cục chỉ nằm ở owa-adapter + shadow-root + Panel
  // (+ entry pages DOM extension + file test). Component/module khác phải đi qua owa-adapter facade.
  it("CR-C: document.querySelector/createElement/getElementById CHỈ trong biên DOM cho phép", () => {
    const offenders = SOURCES.filter((file) => DOM_API_PATTERN.test(readFileSync(file, "utf8")) && !domAllowed(file));
    expect(offenders).toEqual([]);
  });

  // TC-121 (2) — API surface actions.ts CHỈ { openReplyBox, insertDraft, injectToolbarButton } (type-only export bị erase).
  // injectToolbarButton dùng cho UI panel (tắt mặc định BR-03) — không phải API gửi mail.
  it("TC-121: actions.ts chỉ export { openReplyBox, insertDraft, injectToolbarButton } (BR-01 lớp 2)", async () => {
    const actions = (await import("../src/content/owa-adapter/actions")) as Record<string, unknown>;
    expect(Object.keys(actions).sort()).toEqual(["injectToolbarButton", "insertDraft", "openReplyBox"]);
  });

  // TC-121 (3) — chuỗi "send-button" CHỈ xuất hiện trong selectors.ts (selectors diagnose — UC-09);
  // file test được ngoại lệ (fixture/comment mô tả invariant — không phải đường code production).
  it("TC-121: 'send-button' chỉ nằm trong selectors.ts (diagnose-only)", () => {
    const offenders = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        relative(file) !== "content/owa-adapter/selectors.ts" &&
        /send-button/i.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
