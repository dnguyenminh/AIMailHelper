// src/shared/storage.ts — StorageWrapper: DUY NHẤT điểm truy cập chrome.storage (TDD §3.3/§6.3).
// Repository pattern: validate BR-15 + area routing BR-04 + versioning/migration + log cảnh báo.
import { AppError } from "./errors";
import type { ProviderId } from "./llm/types";
import {
  DEFAULT_ACTIVE_PROVIDER,
  DEFAULT_AUTOMATION,
  DEFAULT_GENERAL,
  DEFAULT_PROMPTS,
  DEFAULT_VISION,
  isProviderId,
  validateAutomation,
  validateGeneral,
  validatePrompts,
  validateProviderConfig,
  validateVision
} from "./storage-schema";
import type {
  AutomationConfig,
  GeneralConfig,
  KeyStorage,
  PromptsConfig,
  VisionConfig
} from "./types";
import type { LLMConfig } from "./llm/types";

export const SCHEMA_VERSION = 1;
const KEY_SCHEMA_VERSION = "storage.schemaVersion";
const KEY_GENERAL = "config.general";
const KEY_PROMPTS = "config.prompts";
const KEY_AUTOMATION = "config.automation";
const KEY_VISION = "config.vision";
const KEY_ACTIVE_PROVIDER = "config.activeProvider";

const providerKey = (id: ProviderId): string => "config.providers." + id;
const areaOf = (name: KeyStorage): chrome.storage.StorageArea =>
  name === "sync" ? chrome.storage.sync : chrome.storage.local;

function storageError(operation: string): AppError {
  return new AppError("ERR-08", "errors.storageQuota", { operation: operation });
}

// keys = null → đọc toàn bộ area (dùng khi chuyển khu provider config).
async function getRaw(area: chrome.storage.StorageArea, keys: string[] | null): Promise<Record<string, unknown>> {
  try {
    return (await area.get(keys)) as Record<string, unknown>;
  } catch {
    console.warn("[AIMH][storage] get failed");
    throw storageError("get");
  }
}

async function setRaw(area: chrome.storage.StorageArea, items: Record<string, unknown>): Promise<void> {
  try {
    await area.set(items);
  } catch {
    // §6.3.2: ghi fail → giữ dữ liệu cũ, KHÔNG mất key (ERR-08).
    throw storageError("set");
  }
}

async function removeRaw(area: chrome.storage.StorageArea, keys: string[]): Promise<void> {
  try {
    await area.remove(keys);
  } catch {
    throw storageError("remove");
  }
}

async function readSection<T>(key: string, validate: (v: unknown) => T, fallback: T): Promise<T> {
  const data = await getRaw(chrome.storage.sync, [key]);
  if (!(key in data)) return fallback;
  // EF-3 UC-04: dữ liệu hỏng từ ngoài (devtools) bị từ chối ở lần đọc validate — không âm thầm sửa.
  return validate(data[key]);
}

const writeSection = (key: string, validated: unknown): Promise<void> =>
  setRaw(chrome.storage.sync, { [key]: validated });

export const storage = {
  getGeneral: (): Promise<GeneralConfig> => readSection(KEY_GENERAL, validateGeneral, DEFAULT_GENERAL),
  setGeneral: (value: GeneralConfig): Promise<void> => writeSection(KEY_GENERAL, validateGeneral(value)),
  getPrompts: (): Promise<PromptsConfig> => readSection(KEY_PROMPTS, validatePrompts, DEFAULT_PROMPTS),
  setPrompts: (value: PromptsConfig): Promise<void> => writeSection(KEY_PROMPTS, validatePrompts(value)),
  getAutomation: (): Promise<AutomationConfig> => readSection(KEY_AUTOMATION, validateAutomation, DEFAULT_AUTOMATION),
  setAutomation: (value: AutomationConfig): Promise<void> => writeSection(KEY_AUTOMATION, validateAutomation(value)),
  getVision: (): Promise<VisionConfig> => readSection(KEY_VISION, validateVision, DEFAULT_VISION),
  setVision: (value: VisionConfig): Promise<void> => writeSection(KEY_VISION, validateVision(value)),

  async getActiveProvider(): Promise<ProviderId> {
    const data = await getRaw(chrome.storage.sync, [KEY_ACTIVE_PROVIDER]);
    const value = data[KEY_ACTIVE_PROVIDER];
    return isProviderId(value) ? value : DEFAULT_ACTIVE_PROVIDER;
  },

  async setActiveProvider(id: ProviderId): Promise<void> {
    if (!isProviderId(id)) throw new AppError("ERR-15", "errors.badRequest", { field: "activeProvider" });
    await setRaw(chrome.storage.sync, { [KEY_ACTIVE_PROVIDER]: id });
  },

  // BR-04: config.providers.{id} nằm THEO general.keyStorage (sync mặc định).
  async getProviderConfig(id: ProviderId): Promise<LLMConfig | null> {
    const target = (await this.getGeneral()).keyStorage;
    const data = await getRaw(areaOf(target), [providerKey(id)]);
    if (!(providerKey(id) in data)) return null;
    return validateProviderConfig(data[providerKey(id)]);
  },

  async setProviderConfig(id: ProviderId, value: unknown): Promise<void> {
    const config = validateProviderConfig(value);
    if (config.provider !== id) {
      throw new AppError("ERR-15", "errors.badRequest", { field: "provider", allowed: id });
    }
    const target = (await this.getGeneral()).keyStorage;
    await setRaw(areaOf(target), { [providerKey(id)]: config });
  },

  // BR-04: chuyển khu = ghi khu mới + XÓA khu cũ — KHÔNG tồn tại đồng thời 2 bản (KEY_STORAGE_SET §6.1).
  async setKeyStorage(target: KeyStorage): Promise<void> {
    if (!["sync", "local"].includes(target)) {
      throw new AppError("ERR-15", "errors.badRequest", { field: "keyStorage", allowed: "sync|local" });
    }
    const general = await this.getGeneral();
    if (general.keyStorage === target) return;
    const from = areaOf(general.keyStorage);
    const to = areaOf(target);
    const data = await getRaw(from, null);
    const movedKeys: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("config.providers.")) continue;
      await setRaw(to, { [key]: validateProviderConfig(value) });
      movedKeys.push(key);
    }
    if (movedKeys.length > 0) await removeRaw(from, movedKeys);
    await this.setGeneral({ ...general, keyStorage: target });
  }
};

export type StorageWrapper = typeof storage;

// §3.3/§6.3.1 — migration: schemaVersion ở CẢ sync + local; MIGRATIONS pure + idempotent.
type MigrationStep = (data: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, MigrationStep> = {}; // v1 — chưa có bước nào

const syncSeed = (): Record<string, unknown> => ({
  [KEY_GENERAL]: DEFAULT_GENERAL,
  [KEY_PROMPTS]: DEFAULT_PROMPTS,
  [KEY_AUTOMATION]: DEFAULT_AUTOMATION,
  [KEY_VISION]: DEFAULT_VISION,
  [KEY_ACTIVE_PROVIDER]: DEFAULT_ACTIVE_PROVIDER
});

const versionOf = (data: Record<string, unknown>): number => {
  const value = data[KEY_SCHEMA_VERSION];
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
};

async function migrateArea(area: chrome.storage.StorageArea, label: string, seed: () => Record<string, unknown>): Promise<void> {
  const current = versionOf(await getRaw(area, [KEY_SCHEMA_VERSION]));
  if (current > SCHEMA_VERSION) {
    // Downgrade: KHÔNG đụng dữ liệu, log cảnh báo, chạy read-only config (§3.3).
    console.warn("[AIMH][storage] downgrade data v" + current + " > code v" + SCHEMA_VERSION + " (" + label + ") — read-only");
    return;
  }
  if (current === 0) {
    await setRaw(area, { ...seed(), [KEY_SCHEMA_VERSION]: SCHEMA_VERSION }); // lần đầu: defaults + version=1
    return;
  }
  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) continue;
    try {
      const all = await getRaw(area, []);
      await setRaw(area, step(all));
      await setRaw(area, { [KEY_SCHEMA_VERSION]: version });
    } catch (error) {
      // §6.3.1 #3: migration fail → DỪNG chuỗi, giữ nguyên dữ liệu (KHÔNG xóa apiKey — BR-04).
      console.error("[AIMH][storage] migration v" + version + " FAILED (" + label + ") — dừng, giữ dữ liệu", error);
      return;
    }
  }
}

export async function migrateIfNeeded(): Promise<void> {
  await migrateArea(chrome.storage.sync, "sync", syncSeed);
  await migrateArea(chrome.storage.local, "local", () => ({}));
}
