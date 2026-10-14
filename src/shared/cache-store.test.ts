// src/shared/cache-store.test.ts — typed cache wrapper chrome.storage.local (GĐ3): get/set/remove,
// entry hỏng → null + tự xóa (§6.3.2 EF-3), ghi fail → ERR-08, getCacheKeys(prefix).
import { beforeEach, describe, expect, it } from "vitest";
import { createChromeMock } from "../../tests/mocks/chrome";
import { getCache, getCacheKeys, removeCache, setCache } from "./cache-store";

type Chrome = { chrome: ReturnType<typeof createChromeMock> };
const asInt = (v: unknown): number | null => (typeof v === "number" ? v : null);

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
});

describe("cache-store — Repository client cho cache.locator/triage", () => {
  it("set/get roundtrip; key thiếu → null", async () => {
    await setCache("cache.x", { a: 1 });
    const entry = await getCache("cache.x", (v) => (v && typeof v === "object" ? (v as { a: number }) : null));
    expect(entry?.a).toBe(1);
    expect(await getCache("cache.y", asInt)).toBeNull();
  });

  it("entry hỏng (validator từ chối) → null VÀ tự xóa khỏi storage (§6.3.2)", async () => {
    await setCache("cache.bad", { corrupted: true });
    expect(await getCache("cache.bad", asInt)).toBeNull();
    expect(await getCacheKeys("cache.bad")).toEqual([]); // đã dọn
  });

  it("ghi fail (quota) → AppError ERR-08 (§6.3.2)", async () => {
    const ctx = globalThis as unknown as Chrome;
    ctx.chrome.storage.local.failNextSet();
    await expect(setCache("cache.z", 1)).rejects.toMatchObject({ code: "ERR-08" });
  });

  it("getCacheKeys lọc theo prefix; removeCache xóa đúng key", async () => {
    await setCache("cache.locator.reply-button", 1);
    await setCache("cache.locator.compose-box", 2);
    await setCache("cache.triage.m1", 3);
    const keys = await getCacheKeys("cache.locator.");
    expect(keys.sort()).toEqual(["cache.locator.compose-box", "cache.locator.reply-button"]);
    await removeCache("cache.locator.reply-button");
    expect(await getCacheKeys("cache.locator.")).toEqual(["cache.locator.compose-box"]);
  });
});
