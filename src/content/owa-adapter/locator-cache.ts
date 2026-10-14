// src/content/owa-adapter/locator-cache.ts — cache T2 theo layoutHash (TDD §3.1.2; BR-06; #8).
// Key `cache.locator.{functionKey}` (§6.3, storage.local qua cache-store — Repository client §4.4).
// Đọc: hash khác → coi như KHÔNG TỒN TẠI (không thử resolve entry stale); INVARIANT #8/§7.2:
// entry persisted bắt buộc strategy="selector" — refId chết cùng JS context, không bao giờ ghi.
import { getCache, getCacheKeys, removeCache, setCache } from "../../shared/cache-store";
import type { LocatorCacheEntry } from "../../shared/types";

const KEY_PREFIX = "cache.locator.";

const keyOf = (functionKey: string): string => KEY_PREFIX + functionKey;

// Validator: shape đúng + strategy === "selector" (invariant #8). Sai/hỏng → null (entry bị dọn).
function validateEntry(value: unknown): LocatorCacheEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Partial<LocatorCacheEntry>;
  if (entry.strategy !== "selector") return null; // refId/hỏng → coi như không tồn tại
  if (typeof entry.functionKey !== "string" || typeof entry.value !== "string") return null;
  if (typeof entry.layoutHash !== "string" || typeof entry.savedAt !== "string") return null;
  return entry as LocatorCacheEntry;
}

// Cache hit CHỈ khi hash hiện tại khớp hash lúc ghi (BR-06) — hash khác → null.
export async function getLocator(functionKey: string, currentHash: string): Promise<LocatorCacheEntry | null> {
  const entry = await getCache(keyOf(functionKey), validateEntry);
  if (entry === null || entry.layoutHash !== currentHash) return null;
  return entry;
}

// GHI — chỉ strategy="selector" (bất biến #8); value rỗng → không ghi (tránh cache rác).
export async function setLocator(functionKey: string, selector: string, layoutHash: string): Promise<void> {
  if (selector.length === 0) return;
  const entry: LocatorCacheEntry = {
    functionKey: functionKey,
    strategy: "selector", // persisted entry BẮT BUỘC selector — unit test assert (§7.2 #8)
    value: selector,
    layoutHash: layoutHash,
    savedAt: new Date().toISOString()
  };
  await setCache(keyOf(functionKey), entry);
}

export async function removeLocator(functionKey: string): Promise<void> {
  await removeCache(keyOf(functionKey));
}

// Chỉ giữ entry của hash hiện tại — entry hash cũ bị xóa (§3.1.2; NFR LOCATOR_CACHE #7.4).
export async function evictStaleHashes(currentHash: string): Promise<number> {
  const keys = await getCacheKeys(KEY_PREFIX);
  let removed = 0;
  for (const key of keys) {
    const entry = await getCache(key, validateEntry); // đọc bằng FULL key storage
    if (entry === null || entry.layoutHash !== currentHash) {
      await removeCache(key);
      removed += 1;
    }
  }
  return removed;
}
