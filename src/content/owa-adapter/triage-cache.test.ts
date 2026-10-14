// src/content/owa-adapter/triage-cache.test.ts — cache.triage.{messageId} (GĐ5): BR-09 roundtrip,
// ghi GỘP batch (1 lần set — FSD 5.4.1), LRU evict 500 theo analyzedAt (§7.4 #10), entry hỏng dọn.
import { beforeEach, describe, expect, it } from "vitest";
import { createChromeMock } from "../../../tests/mocks/chrome";
import type { ChromeMock } from "../../../tests/mocks/chrome";
import { evictTriageOverflow, getTriageMany, loadAllTriage, setTriageMany, TRIAGE_CACHE_LRU } from "./triage-cache";
import type { TriageScore } from "../../shared/types";

type Chrome = { chrome: ChromeMock };

const score = (id: string, analyzedAt: string, value = 50): TriageScore =>
  ({ messageId: id, score: value, reason: "lý do " + id, analyzedAt: analyzedAt });

beforeEach(() => {
  (globalThis as unknown as Chrome).chrome = createChromeMock();
});

describe("triage-cache — BR-09 (khóa messageId, storage.local)", () => {
  it("set GỘP nhiều score trong MỘT lần set → getTriageMany trả đủ", async () => {
    const local = (globalThis as unknown as Chrome).chrome.storage.local;
    await setTriageMany([score("m1", "2026-10-15T01:00:00Z"), score("m2", "2026-10-15T02:00:00Z", 80)]);
    const keysBefore = local.dump().size;
    const cached = await getTriageMany(["m1", "m2", "m3"]);
    expect(cached.get("m1")?.score).toBe(50);
    expect(cached.get("m2")?.score).toBe(80);
    expect(cached.has("m3")).toBe(false);
    expect(local.dump().size).toBe(keysBefore); // 1 batch set — không phát sinh key thêm
  });

  it("entry hỏng (devtools/schema cũ) → coi như không tồn tại (không crash)", async () => {
    const local = (globalThis as unknown as Chrome).chrome.storage.local;
    await local.set({ "cache.triage.bad": { messageId: "bad" } }); // thiếu score/reason/analyzedAt
    await local.set({ "cache.triage.ok": score("ok", "2026-10-15T00:00:00Z") });
    const cached = await getTriageMany(["bad", "ok"]);
    expect(cached.has("bad")).toBe(false);
    expect(cached.has("ok")).toBe(true);
  });
});

describe("triage-cache — LRU 500 (TDD §7.4 #10)", () => {
  it("502 entry → setTriageMany tự evict về đúng 500; evict analyzedAt CŨ NHẤT; key mới còn", async () => {
    const items: TriageScore[] = [];
    for (let i = 0; i < TRIAGE_CACHE_LRU + 2; i += 1) {
      items.push(score("m" + i, new Date(Date.UTC(2026, 9, 15, 0, 0, i)).toISOString()));
    }
    await setTriageMany(items); // ghi GỘP + auto-evict về cap
    const all = await loadAllTriage();
    expect(all.size).toBe(TRIAGE_CACHE_LRU);
    expect(all.has("m0")).toBe(false); // analyzedAt cũ nhất bị evict
    expect(all.has("m1")).toBe(false);
    expect(all.has("m" + (TRIAGE_CACHE_LRU + 1))).toBe(true); // key vừa set còn
  });

  it("evictTriageOverflow trả số entry đã evict khi gọi trực tiếp (viết thẳng 502)", async () => {
    const local = (globalThis as unknown as Chrome).chrome.storage.local;
    const items: Record<string, unknown> = {};
    for (let i = 0; i < TRIAGE_CACHE_LRU + 2; i += 1) {
      items["cache.triage.m" + i] = score("m" + i, new Date(Date.UTC(2026, 9, 15, 0, 0, i)).toISOString());
    }
    await local.set(items);
    expect(await evictTriageOverflow()).toBe(2);
    const all = await loadAllTriage();
    expect(all.size).toBe(TRIAGE_CACHE_LRU);
    expect(all.has("m0")).toBe(false);
  });

  it("≤500 entry → không evict gì; loadAllTriage dọn entry hỏng", async () => {
    await setTriageMany([score("a", "2026-10-15T00:00:00Z")]);
    expect(await evictTriageOverflow()).toBe(0);
    const local = (globalThis as unknown as Chrome).chrome.storage.local;
    await local.set({ "cache.triage.bad": 42 });
    const all = await loadAllTriage();
    expect(all.size).toBe(1);
    expect(local.dump().has("cache.triage.bad")).toBe(false); // entry hỏng đã dọn (§6.3.2)
  });
});
