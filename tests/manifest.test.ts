// tests/manifest.test.ts — STC TC-101 (FR-GD1-01, BR-16, SR-12 least-privilege) + TC-606 phần CSP.
// Gap Critical P6 2026-10-15: bề mặt quyền của manifest trước đó KHÔNG có test nào — thêm quyền
// thừa (debugger/tabs/all_urls tĩnh) hay mở CSP sẽ không làm fail test nào. Chạy environment node
// (jsdom phá invariant TextEncoder của esbuild khi import @crxjs/vite-plugin).
/** @vitest-environment node */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.config";

// defineManifest() trả ManifestV3Export (có thể là Promise) — shape config của ta là object tĩnh.
interface ManifestConfig {
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  content_scripts: { matches?: string[] }[];
  content_security_policy: { extension_pages: string };
  background: { service_worker: string; type: string };
}

const cfg = manifest as unknown as ManifestConfig;

const OWA_HOSTS = [
  "https://outlook.office.com/*",
  "https://outlook.office365.com/*",
  "https://outlook.live.com/*"
];

const CLOUD_HOSTS = [
  "https://api.openai.com/*",
  "https://*.openai.azure.com/*",
  "https://api.anthropic.com/*",
  "https://generativelanguage.googleapis.com/*"
];

describe("manifest MV3 — least privilege (TC-101: FR-GD1-01, BR-16, SR-12)", () => {
  it("permissions CHỈ 'storage' — không quyền nhạy cảm (SR-12)", () => {
    expect(cfg.permissions).toEqual(["storage"]);
    const raw = JSON.stringify(manifest);
    expect(raw).not.toMatch(/"debugger"|"cookies"|"tabs"|"webRequest"|"nativeMessaging"|"declarativeNetRequest"/);
  });

  it("host_permissions = đúng 3 OWA + 4 LLM cloud cố định (BR-05)", () => {
    expect([...(cfg.host_permissions ?? [])].sort()).toEqual([...OWA_HOSTS, ...CLOUD_HOSTS].sort());
  });

  it("content_scripts.matches = đúng 3 domain OWA, 1 khối inject (FR-GD1-01/07)", () => {
    expect(cfg.content_scripts).toHaveLength(1);
    const matches = cfg.content_scripts?.[0]?.matches ?? [];
    expect([...matches].sort()).toEqual([...OWA_HOSTS].sort());
  });

  it("optional_host_permissions ⊇ localhost + https wildcard (SR-13 declare-only — §8.3)", () => {
    expect(cfg.optional_host_permissions ?? []).toEqual(
      expect.arrayContaining(["https://*/*", "http://localhost/*", "http://127.0.0.1/*"])
    );
  });

  it("CSP extension_pages: script-src 'self' + object-src 'self', không nguồn xa (BR-16 — TC-606 #1)", () => {
    const csp = cfg.content_security_policy?.extension_pages ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'self'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("background MV3 service worker type module (FR-GD1-05)", () => {
    expect(cfg.manifest_version).toBe(3);
    expect(cfg.background?.service_worker ?? "").toContain("service-worker");
    expect(cfg.background?.type).toBe("module");
  });

  it("dist/manifest.json (build) khớp cấu hình quyền — guard: chỉ chạy khi đã build", () => {
    const distManifest = join(process.cwd(), "dist", "manifest.json");
    if (!existsSync(distManifest)) {
      expect(true).toBe(true); // npm test không bắt buộc build trước — bỏ qua thân assert
      return;
    }
    const built = JSON.parse(readFileSync(distManifest, "utf8")) as {
      manifest_version?: number;
      permissions?: string[];
      host_permissions?: string[];
      content_security_policy?: { extension_pages?: string };
    };
    expect(built.manifest_version).toBe(3);
    expect(built.permissions).toEqual(["storage"]);
    expect(built.host_permissions ?? []).toEqual(expect.arrayContaining(OWA_HOSTS));
    expect(built.content_security_policy?.extension_pages ?? "").toContain("script-src 'self'");
  });
});
