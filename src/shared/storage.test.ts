// src/shared/storage.test.ts — GĐ1 smoke: validator BR-15 + area routing BR-04 + migration (TDD §3.3, §11).
// STC GĐ1: (2) config lưu/đọc đúng, enum sai bị từ chối (BR-15); (4) migration lần đầu schemaVersion=1.
import { beforeEach, describe, expect, it } from "vitest";
import { createChromeMock } from "../../tests/mocks/chrome";
import { DEFAULT_AUTOMATION, DEFAULT_GENERAL, DEFAULT_PROMPTS, DEFAULT_VISION } from "./storage-schema";
import { SCHEMA_VERSION, storage } from "./storage";
import type { GeneralConfig } from "./types";

type ChromeWithAreas = { chrome: ReturnType<typeof createChromeMock> };

const mock = (): ChromeWithAreas => globalThis as unknown as ChromeWithAreas;

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
});

describe("StorageWrapper — validate BR-15 (GĐ1 Done #2)", () => {
  it("từ chối uiLanguage ngoài enum {vi,en}", async () => {
    const bad = { ...DEFAULT_GENERAL, uiLanguage: "fr" } as unknown as GeneralConfig;
    await expect(storage.setGeneral(bad)).rejects.toMatchObject({ code: "ERR-15" });
  });

  it("từ chối activeProvider ngoài ProviderId", async () => {
    await expect(storage.setActiveProvider("chatgpt" as never)).rejects.toMatchObject({ code: "ERR-15" });
  });

  it("lưu/đọc round-trip general + activeProvider", async () => {
    const value: GeneralConfig = { uiLanguage: "en", keyStorage: "sync", extensionEnabled: false };
    await storage.setGeneral(value);
    await expect(storage.getGeneral()).resolves.toEqual(value);
    await storage.setActiveProvider("gemini");
    await expect(storage.getActiveProvider()).resolves.toBe("gemini");
  });

  it("dữ liệu hỏng từ ngoài bị từ chối khi đọc (EF-3 UC-04)", async () => {
    mock().chrome.storage.sync.dump().set("config.general", "junk-not-an-object");
    await expect(storage.getGeneral()).rejects.toMatchObject({ code: "ERR-15" });
  });

  it("validateProviderConfig: http remote bị từ chối, http localhost được chấp nhận (SR-06)", async () => {
    await expect(
      storage.setProviderConfig("openai-compatible", { provider: "openai-compatible", baseUrl: "http://evil.example.com/v1", model: "m" })
    ).rejects.toMatchObject({ code: "ERR-15", i18nKey: "errors.baseUrlHttpsRequired" });
    await expect(
      storage.setProviderConfig("openai-compatible", { provider: "openai-compatible", baseUrl: "http://localhost:1234/v1", model: "m" })
    ).resolves.toBeUndefined();
  });

  it("validateProviderConfig: cloud thiếu apiKey bị từ chối (BR-04)", async () => {
    await expect(
      storage.setProviderConfig("openai", { provider: "openai", model: "gpt-4o-mini" })
    ).rejects.toMatchObject({ code: "ERR-15" });
  });

  // CR-1 / D-3 (TA follow-up GĐ1): azure.apiVersion regex YYYY-MM-DD — sai format → ERR-15 (BR-15)
  it("validateProviderConfig: azure.apiVersion sai format bị từ chối, đúng format được chấp nhận (BR-15 — CR-1)", async () => {
    const base = { provider: "azure" as const, apiKey: "k", model: "d", azure: { endpoint: "https://r.openai.azure.com", deployment: "d" } };
    for (const bad of ["2024", "10-2024", "2024/10/01", "2024-10-21T00:00:00Z", "abc"]) {
      await expect(
        storage.setProviderConfig("azure", { ...base, azure: { ...base.azure, apiVersion: bad } })
      ).rejects.toMatchObject({ code: "ERR-15", i18nKey: "errors.badRequest", params: { field: "azure.apiVersion", allowed: "YYYY-MM-DD" } });
    }
    await expect(
      storage.setProviderConfig("azure", { ...base, azure: { ...base.azure, apiVersion: "2024-10-21" } })
    ).resolves.toBeUndefined();
  });
});

describe("StorageWrapper — area routing BR-04 (GĐ1)", () => {
  it("provider config nằm theo keyStorage; chuyển khu xóa bản cũ", async () => {
    const config = { provider: "openai" as const, apiKey: "sk-test-1234567890", model: "gpt-4o-mini" };
    await storage.setProviderConfig("openai", config);
    expect(mock().chrome.storage.sync.dump().has("config.providers.openai")).toBe(true);
    expect(mock().chrome.storage.local.dump().has("config.providers.openai")).toBe(false);

    await storage.setKeyStorage("local");
    expect(mock().chrome.storage.local.dump().has("config.providers.openai")).toBe(true);
    expect(mock().chrome.storage.sync.dump().has("config.providers.openai")).toBe(false);
    await expect(storage.getProviderConfig("openai")).resolves.toEqual(config);

    const general = await storage.getGeneral();
    expect(general.keyStorage).toBe("local");
  });

  it("từ chối keyStorage ngoài enum (BR-15)", async () => {
    await expect(storage.setKeyStorage("session" as never)).rejects.toMatchObject({ code: "ERR-15" });
  });
});

describe("StorageWrapper — migration (GĐ1 Done #4)", () => {
  it("lần đầu: ghi schemaVersion=1 + defaults vào sync, version=1 vào local", async () => {
    const { migrateIfNeeded } = await import("./storage");
    await migrateIfNeeded();
    const sync = mock().chrome.storage.sync.dump();
    expect(sync.get("storage.schemaVersion")).toBe(SCHEMA_VERSION);
    expect(sync.get("config.general")).toEqual(DEFAULT_GENERAL);
    expect(sync.get("config.prompts")).toEqual(DEFAULT_PROMPTS);
    expect(sync.get("config.automation")).toEqual(DEFAULT_AUTOMATION);
    expect(sync.get("config.vision")).toEqual(DEFAULT_VISION);
    expect(mock().chrome.storage.local.dump().get("storage.schemaVersion")).toBe(SCHEMA_VERSION);
  });

  it("idempotent — chạy lại không đổi dữ liệu", async () => {
    const { migrateIfNeeded } = await import("./storage");
    await migrateIfNeeded();
    await storage.setGeneral({ ...DEFAULT_GENERAL, uiLanguage: "en" });
    await migrateIfNeeded();
    const general = await storage.getGeneral();
    expect(general.uiLanguage).toBe("en");
  });

  it("downgrade (schemaVersion > code): read-only, không đụng dữ liệu", async () => {
    const future = { version: SCHEMA_VERSION + 1, general: { uiLanguage: "en", keyStorage: "local", extensionEnabled: false } };
    mock().chrome.storage.sync.dump().set("storage.schemaVersion", future.version);
    mock().chrome.storage.sync.dump().set("config.general", future.general);
    const { migrateIfNeeded } = await import("./storage");
    await migrateIfNeeded();
    expect(mock().chrome.storage.sync.dump().get("storage.schemaVersion")).toBe(future.version);
    expect(mock().chrome.storage.sync.dump().get("config.general")).toEqual(future.general);
  });
});
