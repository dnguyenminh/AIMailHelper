// src/content/owa-adapter/actions.test.ts — GĐ4 UC-02 (TDD §3.1.5): openReplyBox dispatch qua
// reply-button (BR-12); insertDraft gate BR-10 (draft rỗng) → AF-5 (compose có nội dung →
// needs-confirm, KHÔNG ghi đè im lặng) → AF-1 (compose chưa mở → mở reply rồi locate lại) →
// điền qua writeText inject. KHÔNG có đường nào tới nút gửi OWA (BR-01 — TC-121/audit).
import { describe, expect, it, vi } from "vitest";
import { insertDraft, openReplyBox } from "./actions";
import type { ActionsDeps, InsertOutcome } from "./actions";
import type { FunctionKey } from "./selectors";
import type { WriteMode } from "./editable";

interface Harness {
  deps: ActionsDeps;
  locateKeys: FunctionKey[];
  writes: { text: string; mode: WriteMode }[];
}

// locate queue: compose-box lần 1 → composeFirst; lần 2+ → composeSecond; reply-button → replyButton.
function makeHarness(opts: {
  composeFirst?: Element | null;
  composeSecond?: Element | null;
  replyButton?: Element | null;
  readText?: string;
  writeOk?: boolean;
}): Harness {
  const locateKeys: FunctionKey[] = [];
  const writes: { text: string; mode: WriteMode }[] = [];
  const locate = async (functionKey: FunctionKey): Promise<Element | null> => {
    locateKeys.push(functionKey);
    if (functionKey === "reply-button") return opts.replyButton ?? null;
    return locateKeys.filter((key) => key === "compose-box").length === 1
      ? (opts.composeFirst ?? null)
      : (opts.composeSecond ?? null);
  };
  return {
    deps: {
      locate: locate,
      readText: () => opts.readText ?? "",
      writeText: (_el, text, mode) => {
        writes.push({ text: text, mode: mode });
        return opts.writeOk ?? true;
      }
    },
    locateKeys: locateKeys,
    writes: writes
  };
}

const el = (): HTMLElement => document.body.appendChild(document.createElement("div"));

describe("openReplyBox (UC-02 AF-1)", () => {
  it("locate reply-button thấy → dispatch MouseEvent nhấn (bubbles) → true", async () => {
    const button = el();
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    const result = await openReplyBox({ locate: async () => button, readText: () => "", writeText: () => true });
    expect(result).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0]?.[0] as MouseEvent;
    expect(event.bubbles).toBe(true);
    expect(event.cancelable).toBe(true);
  });

  it("locate reply-button miss → false, không dispatch gì (0 listener kích hoạt)", async () => {
    const onClick = vi.fn();
    document.body.addEventListener("click", onClick);
    const result = await openReplyBox({ locate: async () => null, readText: () => "", writeText: () => true });
    expect(result).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("insertDraft — UC-02 bước 8 (BR-10 / AF-5 / AF-1 / ERR-09)", () => {
  it("BR-10: draft rỗng → blocked-empty, KHÔNG chạm DOM (locate 0 lần)", async () => {
    const harness = makeHarness({ composeFirst: el() });
    const outcome = await insertDraft("   ", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "blocked-empty" });
    expect(harness.locateKeys).toHaveLength(0);
    expect(harness.writes).toHaveLength(0);
  });

  it("compose thấy + trống → writeText replace → inserted", async () => {
    const harness = makeHarness({ composeFirst: el(), readText: "" });
    const outcome = await insertDraft("Kính gửi anh,", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "inserted" });
    expect(harness.writes[0]).toEqual({ text: "Kính gửi anh,", mode: "replace" });
  });

  it("AF-5: compose có nội dung sẵn + chưa có quyết định → needs-confirm kèm existing, KHÔNG ghi", async () => {
    const harness = makeHarness({ composeFirst: el(), readText: "Dự thảo đang viết dở" });
    const outcome = await insertDraft("Draft AI", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "needs-confirm", existing: "Dự thảo đang viết dở" });
    expect(harness.writes).toHaveLength(0); // KHÔNG ghi đè im lặng — hỏi ở panel
  });

  it("AF-5 quyết định: 'replace' → ghi đè; 'append' → ghép thêm", async () => {
    const replace = makeHarness({ composeFirst: el(), readText: "cũ" });
    await expect(insertDraft("mới", "replace", replace.deps)).resolves.toEqual({ kind: "inserted" });
    expect(replace.writes[0]?.mode).toBe("replace");
    const append = makeHarness({ composeFirst: el(), readText: "cũ" });
    await expect(insertDraft("mới", "append", append.deps)).resolves.toEqual({ kind: "inserted" });
    expect(append.writes[0]?.mode).toBe("append");
  });

  it("UAT (15/10): compose miss → KHÔNG auto-open reply box — trả compose-not-found (user tự bấm Reply trước)", async () => {
    const harness = makeHarness({ composeFirst: null, composeSecond: el(), replyButton: el() });
    const outcome = await insertDraft("Draft", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "compose-not-found" });
    expect(harness.locateKeys).toEqual(["compose-box"]); // KHÔNG gọi reply-button
    expect(harness.writes).toHaveLength(0);
  });

  it("EF-2: compose miss + mở reply box cũng fail → compose-not-found (caller ERR-09 + copy tay)", async () => {
    const harness = makeHarness({ composeFirst: null, replyButton: null });
    const outcome = await insertDraft("Draft", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "compose-not-found" });
    expect(harness.writes).toHaveLength(0);
  });

  it("EF-2b: compose miss, mở reply ok nhưng compose lần 2 vẫn miss → compose-not-found", async () => {
    const harness = makeHarness({ composeFirst: null, composeSecond: null, replyButton: el() });
    await expect(insertDraft("Draft", undefined, harness.deps)).resolves.toEqual({ kind: "compose-not-found" });
  });

  it("ERR-09: writeText thất bại → write-failed (caller map ERR-09, giữ preview copy tay EF-1)", async () => {
    const harness = makeHarness({ composeFirst: el(), writeOk: false });
    const outcome: InsertOutcome = await insertDraft("Draft", undefined, harness.deps);
    expect(outcome).toEqual({ kind: "write-failed" });
  });
});
