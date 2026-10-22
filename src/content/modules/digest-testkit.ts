// src/content/modules/digest-testkit.ts — test harness dùng chung cho digest*.test.ts (TDD §12.1
// tests/helpers — đặt cạnh module). DI fake deps cho TriageController: không Port/storage thật.
import { vi } from "vitest";
import { TriageController } from "./digest";
import type { TriageDeps, TriageUiState } from "./digest";
import type { InboxItem } from "../owa-adapter/triage";
import type { TriageScore } from "../../shared/types";
import type { ErrCode } from "../../shared/errors";
import type { PortEvent } from "../../shared/messaging";
import type { StreamHandle } from "../../shared/port-client";

export const CONFIG = { enabled: false, rules: [], batchSize: 3, throttleMs: 1000, triageCap: 50 };

export function item(id: string): InboxItem {
  return { messageId: id, provenance: "native", subject: "Sujet " + id, sender: "a@x.vn", snippet: "snip " + id };
}

export const scoreOf = (id: string, value: number, reason = "lý do"): TriageScore =>
  ({ messageId: id, score: value, reason: reason, analyzedAt: new Date().toISOString() });

export interface Script {
  respond: (items: InboxItem[], emit: (event: PortEvent) => void) => void; // hành vi từng request
}

export interface Harness {
  deps: TriageDeps;
  states: TriageUiState[];
  requests: { items: InboxItem[]; emit: (event: PortEvent) => void }[];
  sleeps: number[];
  saved: TriageScore[][];
  badges: { messageId: string; score: number }[];
}

// Fake deps: collect/cached/script theo tham số; save/badge/sleep ghi nhận để assert.
export function makeHarness(items: InboxItem[], cached: Map<string, TriageScore> = new Map(), script?: Script, config = CONFIG): Harness {
  const states: TriageUiState[] = [];
  const requests: { items: InboxItem[]; emit: (event: PortEvent) => void }[] = [];
  const sleeps: number[] = [];
  const saved: TriageScore[][] = [];
  const badges: { messageId: string; score: number }[] = [];
  const deps: TriageDeps = {
    collectItems: vi.fn(async () => items),
    folderSignature: vi.fn(async () => null),
    hasFolderChanged: vi.fn(async () => false),
    getCached: vi.fn(async (ids: string[]) => {
      const found = new Map<string, TriageScore>();
      for (const id of ids) {
        const hit = cached.get(id);
        if (hit !== undefined) found.set(id, hit);
      }
      return found;
    }),
    saveScores: vi.fn(async (scores: TriageScore[]) => {
      saved.push(scores);
    }),
    attachBadge: vi.fn((messageId: string, score: number) => {
      badges.push({ messageId: messageId, score: score });
    }),
    getAutomation: vi.fn(async () => config),
    collectUnreadTop: vi.fn(async () => []),
    request: (batch, onEvent) => {
      requests.push({ items: batch as InboxItem[], emit: onEvent });
      if (script !== undefined) script.respond(batch as InboxItem[], onEvent);
      return { cancel: () => undefined } as StreamHandle;
    },
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    onState: (state) => states.push(state)
  };
  return { deps: deps, states: states, requests: requests, sleeps: sleeps, saved: saved, badges: badges };
}

// Mô phỏng 1 batch hoàn tất: progress per-batch + chunk (scores JSON) + done (§6.2 #7).
export const doneWith = (items: InboxItem[], emit: (event: PortEvent) => void, scores: TriageScore[]): void => {
  emit({ type: "progress", requestId: "r", done: scores.length, total: items.length, failed: items.length - scores.length });
  emit({ type: "chunk", requestId: "r", seq: 0, delta: JSON.stringify(scores) });
  emit({ type: "done", requestId: "r" });
};

// Mô phỏng 1 batch lỗi qua Port error event.
export const errorEvent = (code: ErrCode, retryable: boolean): Extract<PortEvent, { type: "error" }> =>
  ({ type: "error", requestId: "r", code: code, i18nKey: "errors.test", retryable: retryable });

export const newController = (harness: Harness): TriageController => new TriageController(harness.deps);
