// src/content/modules/reply-testkit.ts — harness dùng chung reply.test.ts + reply-insert.test.ts
// (TDD §12.1 — đặt cạnh module). DI fake deps cho ReplyController: không Port/adapter thật.
import { expect, vi } from "vitest";
import { ReplyController } from "./reply";
import type { ReplyDeps, ReplyOptions, ReplyUiState } from "./reply";
import type { InsertOutcome } from "../owa-adapter/actions";
import type { PortEvent } from "../../shared/messaging";
import type { EmailData } from "../../shared/types";

export const EMAIL: EmailData = {
  messageId: "m1",
  subject: "Báo giá",
  sender: { name: "An", email: "an@x.vn" },
  to: [],
  cc: [],
  bodyText: "Nội dung",
  detectedView: "reading-pane"
};

export const OPTIONS: ReplyOptions = { tone: "chinh-thuc", language: "auto", extraInstructions: "" };

export interface Harness {
  deps: ReplyDeps;
  states: ReplyUiState[];
  events: ((event: PortEvent) => void)[];
  cancelCount(): number;
  insertSpy: ReturnType<typeof vi.fn>;
  currentIdSpy: ReturnType<typeof vi.fn>;
}

export function makeHarness(outcome: InsertOutcome | null = null, currentId: string | null = "m1"): Harness {
  const states: ReplyUiState[] = [];
  const events: ((event: PortEvent) => void)[] = [];
  let cancels = 0;
  const insertSpy = vi.fn(async () => outcome ?? ({ kind: "inserted" } as InsertOutcome));
  const currentIdSpy = vi.fn(async () => currentId);
  const deps: ReplyDeps = {
    request: (_kind, _payload, onEvent) => {
      events.push(onEvent);
      return { cancel: () => { cancels += 1; } };
    },
    insertDraft: insertSpy,
    currentMessageId: currentIdSpy,
    onState: (state) => states.push(state)
  };
  return { deps: deps, states: states, events: events, cancelCount: () => cancels, insertSpy: insertSpy, currentIdSpy: currentIdSpy };
}

export async function started(harness: Harness): Promise<ReplyController> {
  const controller = new ReplyController(harness.deps);
  controller.start(EMAIL, OPTIONS);
  await vi.waitFor(() => expect(harness.events.length).toBeGreaterThan(0));
  return controller;
}

export function lastEvent(harness: Harness): (event: PortEvent) => void {
  return harness.events[harness.events.length - 1] as (event: PortEvent) => void;
}
