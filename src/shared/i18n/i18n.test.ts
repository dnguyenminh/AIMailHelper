// src/shared/i18n/i18n.test.ts — GĐ1: fallback en → raw key + warn (ERR-13); placeholder {name} (FSD §10).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../../../tests/mocks/chrome";
import { getUiLanguage, t } from "./index";
import { initI18n, setUiLanguage } from "./index";

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
});
