// src/shared/i18n/i18n.test.ts — GĐ1: fallback en → raw key + warn (ERR-13); placeholder {name} (FSD §10).
// TD-10 (TA review GĐ4): keyset vi.json === en.json — chặn lệch keyset tương lai.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../../../tests/mocks/chrome";
import { getUiLanguage, t } from "./index";
import { initI18n, setUiLanguage } from "./index";
import enDict from "./en.json";
import viDict from "./vi.json";

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
  vi.restoreAllMocks();
});

describe("i18n — FR-GD1-06 (GĐ1 Deliverable: vi/en đổi được)", () => {
  it("mặc định vi; placeholder {name} render đúng", async () => {
    await initI18n();
    expect(getUiLanguage()).toBe("vi");
    expect(t("popup.provider.label", { provider: "openai" })).toBe("Provider: openai");
  });

  it("đổi sang en qua setUiLanguage (UC-08) — persist + notify", async () => {
    await initI18n();
    const areas = globalThis as unknown as { chrome: { storage: { sync: { dump(): Map<string, unknown> } } } };
    await setUiLanguage("en");
    expect(getUiLanguage()).toBe("en");
    expect(t("popup.toggle.extension")).toBe("Enable extension");
    const general = areas.chrome.storage.sync.dump().get("config.general") as { uiLanguage: string };
    expect(general.uiLanguage).toBe("en");
  });

  it("thiếu key → fallback en; thiếu cả hai → raw key + console.warn (ERR-13)", async () => {
    await initI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("errors.notImplemented", { phase: "GĐ2" })).toContain("GĐ2");
    expect(t("key.khong.ton.tai")).toBe("key.khong.ton.tai");
    expect(warn).toHaveBeenCalled();
  });

  it("placeholder không khớp → render chuỗi gốc + warn (FSD §10.2 #4)", async () => {
    await initI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("popup.provider.label", { ten: "openai" })).toBe("Provider: {provider}");
    expect(warn).toHaveBeenCalled();
  });

  // TD-10 (TA review GĐ4 — làm cùng batch GĐ5): đọc vi.json + en.json, assert keyset bằng nhau
  // (Object.keys) — chặn lệch keyset khi thêm key mới ở các GĐ sau (ERR-13 sẽ warn ầm ĩ nếu lệch).
  it("TD-10: keyset vi.json === en.json (Object.keys parity)", () => {
    const viKeys = Object.keys(viDict).sort();
    const enKeys = Object.keys(enDict).sort();
    expect(viKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(viKeys);
    // Defense-in-depth: đọc trực tiếp từ disk (không qua import cache) — cùng kết luận
    const viRaw = JSON.parse(readFileSync(join(process.cwd(), "src", "shared", "i18n", "vi.json"), "utf8")) as Record<string, string>;
    const enRaw = JSON.parse(readFileSync(join(process.cwd(), "src", "shared", "i18n", "en.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(enRaw).sort()).toEqual(Object.keys(viRaw).sort());
    expect(Object.keys(viRaw).length).toBe(201); // UAT unread +3 + digest scroll/open +2 = 201 → 180); P5.7 F-01 +1 permissionWarning (180 → 181)
  });
});
