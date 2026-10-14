// src/content/owa-adapter/locator-cache.test.ts — BR-06 + invariant #8 (§7.2): hash khớp mới hit;
// hash khác → coi như KHÔNG TỒN TẠI; entry persisted 100% strategy="selector" (refId bị từ chối);
// evictStaleHashes chỉ giữ hash hiện tại; entry hỏng → tự dọn.
import { beforeEach, describe, expect, it } from "vitest";
import { createChromeMock } from "../../../tests/mocks/chrome";
import { evictStaleHashes, getLocator, removeLocator, setLocator } from "./locator-cache";

type Chrome = { chrome: ReturnType<typeof createChromeMock> };

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
});

describe("locator-cache — BR-06 (layoutHash) + #8 (chỉ persist selector)", () => {
  it("set/get roundtrip cùng hash → entry đủ field, strategy='selector'", async () => {
    await setLocator("reply-button", 'button[aria-label="Reply"]', "hash-1");
    const entry = await getLocator("reply-button", "hash-1");
    expect(entry?.strategy).toBe("selector");
    expect(entry?.value).toBe('button[aria-label="Reply"]');
    expect(entry?.layoutHash).toBe("hash-1");
    expect(typeof entry?.savedAt).toBe("string");
  });

  it("hash KHÁC → coi như không tồn tại (không thử resolve entry stale — BR-06)", async () => {
    await setLocator("reply-button", 'button[aria-label="Reply"]', "hash-1");
    expect(await getLocator("reply-button", "hash-2")).toBeNull(); // MS đổi UI → vô hiệu
  });

  it("INVARIANT #8: entry persisted luôn strategy='selector' — value rỗng không ghi", async () => {
    await setLocator("reply-button", "", "hash-1");
    expect(await getLocator("reply-button", "hash-1")).toBeNull(); // không cache rác
    await setLocator("compose-box", 'div[role="textbox"]', "hash-1");
    const ctx = globalThis as unknown as Chrome;
    const raw = ctx.chrome.storage.local.dump().get("cache.locator.compose-box") as { strategy: string };
    expect(raw.strategy).toBe("selector"); // không bao giờ ghi refId xuống storage
  });

  it("evictStaleHashes: xóa mọi entry hash cũ, giữ đúng hash hiện tại (BR-06)", async () => {
    await setLocator("reply-button", 'button[aria-label="Reply"]', "hash-old");
    await setLocator("compose-box", 'div[role="textbox"]', "hash-new");
    const removed = await evictStaleHashes("hash-new");
    expect(removed).toBe(1);
    expect(await getLocator("reply-button", "hash-old")).toBeNull(); // entry cũ đã bị dọn
    expect(await getLocator("compose-box", "hash-new")).not.toBeNull();
  });

  it("entry hỏng từ ngoài (devtools) → get trả null + tự dọn (§6.3.2)", async () => {
    const ctx = globalThis as unknown as Chrome;
    await ctx.chrome.storage.local.set({ "cache.locator.reply-button": { strategy: "refId", value: "ref_1" } });
    expect(await getLocator("reply-button", "hash-1")).toBeNull(); // refId persist bị từ chối (#8)
    expect(ctx.chrome.storage.local.dump().has("cache.locator.reply-button")).toBe(false);
    await removeLocator("reply-button"); // idempotent
    expect(await getLocator("reply-button", "hash-1")).toBeNull();
  });
});
