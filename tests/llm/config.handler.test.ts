// tests/llm/config.handler.test.ts — integration-lite CONFIG qua MessageRouter thật + chrome mock
// (TD-3 — khuyến nghị TA GĐ1/GĐ2 checklist #6): gửi qua chrome.runtime.sendMessage → router.listen()
// → config.handler → storage. CONFIG_GET trả hasKey + prefill phi nhạy cảm, apiKey KHÔNG rời SW (BR-08);
// CONFIG_SET merge key khi payload trống (BR-08); sai section + azure.apiVersion sai format → ERR-15
// (BR-15 — CR-1/D-3); KEY_STORAGE_SET đổi khu BR-04.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerConfigHandlers } from "../../src/background/handlers/config.handler";
import { storage } from "../../src/shared/storage";
import { FIXTURE_KEYS } from "./helpers";
import type { ConfigGetResponse } from "../../src/shared/types";
import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock };
const cg = (): Chrome => globalThis as unknown as Chrome;

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
  vi.restoreAllMocks();
});

// Wire router THẬT vào chrome mock — sendMessage đi qua dispatch + error envelope thật (không mock handler).
function boot(): void {
  const router = new MessageRouter();
  registerConfigHandlers(router);
  router.listen();
}

async function rpc<T>(kind: string, payload: unknown, requestId: string): Promise<RpcResponse<T>> {
  return (await cg().chrome.runtime.sendMessage({ kind: kind, requestId: requestId, payload: payload })) as RpcResponse<T>;
}

describe("CONFIG_GET (§6.1 #1) — TD-3", () => {
  it("lần đầu: defaults + hasKey=false, config=null", async () => {
    boot();
    const response = await rpc<ConfigGetResponse>("CONFIG_GET", {}, "r0");
    if (!response.ok) throw new Error("expected success: " + JSON.stringify(response.error));
    expect(response.data.activeProvider).toBe("openai");
    expect(response.data.general).toMatchObject({ uiLanguage: "vi", keyStorage: "sync" });
    expect(response.data.providers["openai"]).toMatchObject({ hasKey: false, config: null });
  });

  it("đã lưu key: hasKey=true + prefill phi nhạy cảm; JSON response KHÔNG chứa key (BR-08)", async () => {
    await storage.setProviderConfig("openai", { provider: "openai", apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" });
    boot();
    const response = await rpc<ConfigGetResponse>("CONFIG_GET", {}, "r1");
    if (!response.ok) throw new Error("expected success: " + JSON.stringify(response.error));
    const openai = response.data.providers["openai"];
    expect(openai.hasKey).toBe(true);
    expect(openai.config).toMatchObject({ provider: "openai", model: "gpt-4o-mini" });
    expect("apiKey" in (openai.config ?? {})).toBe(false);
    expect(JSON.stringify(response)).not.toContain(FIXTURE_KEYS.openai);
  });
});

describe("CONFIG_SET (§6.1 #2) — TD-3", () => {
  it("apiKey payload trống → merge key đã lưu ở SW (BR-08 — key chưa bao giờ rời SW)", async () => {
    await storage.setProviderConfig("openai", { provider: "openai", apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" });
    boot();
    const response = await rpc("CONFIG_SET", { section: "provider", providerId: "openai", value: { provider: "openai", apiKey: "", model: "gpt-4o" } }, "r2");
    expect(response.ok).toBe(true);
    const stored = cg().chrome.storage.sync.dump().get("config.providers.openai") as { apiKey?: string; model: string };
    expect(stored.apiKey).toBe(FIXTURE_KEYS.openai); // key giữ nguyên khi user chỉ đổi model
    expect(stored.model).toBe("gpt-4o");
  });

  it("azure apiVersion sai format → ERR-15 params field azure.apiVersion (BR-15 — CR-1); đúng format → ok", async () => {
    boot();
    const value = { provider: "azure", apiKey: FIXTURE_KEYS.azure, model: "d", azure: { endpoint: "https://r.openai.azure.com", deployment: "d", apiVersion: "10-2024" } };
    const bad = await rpc("CONFIG_SET", { section: "provider", providerId: "azure", value: value }, "r3");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.params?.["field"]).toBe("azure.apiVersion");
    const good = await rpc("CONFIG_SET", { section: "provider", providerId: "azure", value: { ...value, azure: { ...value.azure, apiVersion: "2024-10-21" } } }, "r4");
    expect(good.ok).toBe(true);
  });

  it("section lạ → ERR-15 (BR-15 — không âm thầm sửa)", async () => {
    boot();
    const response = await rpc("CONFIG_SET", { section: "unknown-section", value: {} }, "r5");
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("ERR-15");
  });
});

describe("KEY_STORAGE_SET (§6.1 #3) — TD-3", () => {
  it("sync→local di chuyển provider config (BR-04 — không tồn tại 2 bản); giá trị lạ → ERR-15", async () => {
    await storage.setProviderConfig("openai", { provider: "openai", apiKey: FIXTURE_KEYS.openai, model: "gpt-4o-mini" });
    boot();
    const ok = await rpc("KEY_STORAGE_SET", { keyStorage: "local" }, "r6");
    expect(ok.ok).toBe(true);
    expect(cg().chrome.storage.local.dump().has("config.providers.openai")).toBe(true);
    expect(cg().chrome.storage.sync.dump().has("config.providers.openai")).toBe(false);
    const bad = await rpc("KEY_STORAGE_SET", { keyStorage: "session" }, "r7");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("ERR-15");
  });
});
