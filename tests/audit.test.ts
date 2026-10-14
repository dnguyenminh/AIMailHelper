// tests/audit.test.ts — source audit CI-style (DEV-SECURITY-CHECKLIST GĐ1: SR-10; TDD §12.3 br01-audit; BR-16).
// SR-10: 0 match dangerouslySetInnerHTML / .innerHTML = trong src/.
// BR-01: không tồn tại pattern "send ... click / click ... send" trong src/ (no-Send guarantee lớp 2, §8.5).
// BR-16: không eval / new Function; không API key hard-code (sk-… / AIza… hex-32).
// File ≤ 200 dòng (TDD §1.4 #7 — GĐ1 Done #5).
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
});
