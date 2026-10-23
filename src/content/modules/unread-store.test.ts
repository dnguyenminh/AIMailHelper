// src/content/modules/unread-store.test.ts — uat90: persist danh sách unread qua
// chrome.storage.local (mock) + TriageController.restore (F5/restart không mất kết quả).
// SR-10: chỉ dùng chrome.storage mock + state machine — không đụng DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadUnreadDigest, saveUnreadDigest } from "./unread-store";
import { TriageController } from "./digest";
import type { DigestEntry, TriageDeps, TriageUiState } from "./digest-types";
import type { InboxItem } from "../owa-adapter/triage";

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) ?? {} })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        })
      }
    }
  };
});

const entry = (id: string): DigestEntry => ({ messageId: id, subject: "S " + id, sender: "a@x.vn", score: 70, reason: "r" });

describe("unread-store — persist danh sách chưa đọc (uat90)", () => {
  it("round-trip: save → load ra đúng entries", async () => {
    await saveUnreadDigest([entry("m1"), entry("m2")]);
    const loaded = await loadUnreadDigest();
    expect(loaded.map((e) => e.messageId)).toEqual(["m1", "m2"]);
  });

  it("chưa có gì → [] (caller giữ hành vi cũ)", async () => {
    expect(await loadUnreadDigest()).toEqual([]);
  });

  it("danh sách RỖNG không ghi đè bản đã lưu (tránh mất do trạng thái tạm)", async () => {
    await saveUnreadDigest([entry("m1")]);
    await saveUnreadDigest([]);
    const loaded = await loadUnreadDigest();
    expect(loaded.length).toBe(1); // bản cũ được giữ
  });

  it("cap 200 entry", async () => {
    const many = Array.from({ length: 500 }, (_, i) => entry("m" + String(i)));
    await saveUnreadDigest(many);
    const loaded = await loadUnreadDigest();
    expect(loaded.length).toBeLessThanOrEqual(200);
  });
});

describe("TriageController.restore — khôi phục sau reload (uat90)", () => {
  const states: TriageUiState[] = [];
  const deps: TriageDeps = {
    collectItems: vi.fn(async () => []),
    folderSignature: vi.fn(async () => null),
    hasFolderChanged: vi.fn(async () => false),
    getCached: vi.fn(async () => new Map()),
    saveScores: vi.fn(async () => undefined),
    attachBadge: vi.fn(() => undefined),
    getAutomation: vi.fn(async () => ({ enabled: false, rules: [], batchSize: 5, throttleMs: 1000, triageCap: 50 })),
    collectUnreadTop: vi.fn(async () => []),
    request: vi.fn(() => ({ cancel: () => undefined })),
    sleep: vi.fn(async () => undefined),
    onState: (s) => states.push(s)
  };

  it("restore(digest) → state done với digest (👁/↗ dùng được ngay sau F5)", () => {
    const controller = new TriageController(deps);
    controller.restore([entry("m1"), entry("m2")]);
    const state = controller.getState();
    expect(state.status).toBe("done");
    expect(state.digest.map((e) => e.messageId)).toEqual(["m1", "m2"]);
  });

  it("restore khi scan đang treo → restore thắng; scan hoàn tất sau → fresh wins", async () => {
    states.length = 0;
    let releaseCollect: (() => void) | null = null;
    const collectPromise = new Promise<InboxItem[]>((resolve) => { releaseCollect = () => resolve([]); });
    const hangingDeps: TriageDeps = { ...deps, collectItems: () => collectPromise };
    const controller = new TriageController(hangingDeps);
    const run = controller.start(); // scan treo ở collectItems (state chưa running)
    controller.restore([entry("m9")]); // restore lúc scan treo → user thấy danh sách ngay
    expect(controller.getState().digest.some((e) => e.messageId === "m9")).toBe(true);
    (releaseCollect as unknown as () => void)(); // scan hoàn tất → fresh wins (đúng ngữ nghĩa AF-4)
    await run;
    const last = controller.getState();
    expect(last.status).toBe("done");
    expect(last.digest.length).toBe(0); // scan mới đè restore — hợp lệ
  });

  it("restore list rỗng → bỏ qua", () => {
    const controller = new TriageController(deps);
    controller.restore([]);
    expect(controller.getState().status).toBe("idle");
  });
});
