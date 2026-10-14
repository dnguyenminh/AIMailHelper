// src/shared/cache-store.ts — typed cache wrapper trên chrome.storage.local (TDD §4.1 bổ sung —
// tách khỏi storage.ts để giữ file ≤ 200 dòng; vẫn nguyên tắc Repository/BR-15: MỌI truy cập
// chrome.storage đi qua typed wrapper có validate). Dùng cho cache.locator (GĐ3) + cache.triage (GĐ5).
// §6.3.2: deserialize fail → xóa entry hỏng + trả null (EF-3 UC-04); ghi fail → ERR-08.
import { AppError } from "./errors";

export type CacheValidator<T> = (value: unknown) => T | null;

function storageError(operation: string): AppError {
  return new AppError("ERR-08", "errors.storageQuota", { operation: operation });
}

const area = (): chrome.storage.StorageArea => chrome.storage.local;

async function readRaw(key: string): Promise<unknown> {
  try {
    const data = (await area().get(key)) as Record<string, unknown>;
    return key in data ? data[key] : undefined;
  } catch {
    throw storageError("get");
  }
}

// Trả null khi: thiếu | validator từ chối (entry hỏng → xóa luôn, §6.3.2).
export async function getCache<T>(key: string, validate: CacheValidator<T>): Promise<T | null> {
  const raw = await readRaw(key);
  if (raw === undefined) return null;
  const value = validate(raw);
  if (value === null) {
    await removeCache(key); // entry hỏng từ ngoài (devtools) — dọn ngay
    return null;
  }
  return value;
}

export async function setCache(key: string, value: unknown): Promise<void> {
  try {
    await area().set({ [key]: value });
  } catch {
    throw storageError("set");
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    await area().remove(key);
  } catch {
    throw storageError("remove");
  }
}

// Liệt kê key có prefix (enum qua get(null) — mock + Chrome đều hỗ trợ).
export async function getCacheKeys(prefix: string): Promise<string[]> {
  const all = await getCacheAll(prefix);
  return Object.keys(all);
}

// Đọc TẤT CẢ entry có prefix trong MỘT lần get(null) (cache triage GĐ5 — tránh N lần get).
export async function getCacheAll(prefix: string): Promise<Record<string, unknown>> {
  let all: Record<string, unknown>;
  try {
    all = (await area().get(null)) as Record<string, unknown>;
  } catch {
    throw storageError("get");
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(prefix)) result[key] = value;
  }
  return result;
}

// Ghi GỘP nhiều key trong MỘT lần set (§3.3 — cache triage ghi gộp batch, FSD 5.4.1 TA note).
export async function setCacheMany(items: Record<string, unknown>): Promise<void> {
  try {
    await area().set(items);
  } catch {
    throw storageError("set");
  }
}
