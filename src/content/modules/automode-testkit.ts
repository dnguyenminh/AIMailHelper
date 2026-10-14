// src/content/modules/automode-testkit.ts — harness DI fake dùng chung automode*.test.ts
// (TDD §12.1 — đặt cạnh module, pattern digest-testkit). Không Port/storage/adapter thật:
// observer fake (đăng ký/disconnect + trigger thủ công), Port event theo script, queue in-memory.
import { expect, vi } from "vitest";
import { AutoModeController } from "./automode";
import type { AutoModeDeps, AutoModeState, AutoObserver } from "./automode-types";
import type { InsertOutcome } from "../owa-adapter/actions";
import type { PortEvent } from "../../shared/messaging";
import type { StreamHandle } from "../../shared/port-client";
import type { AnalysisResult, AutomationConfig, EmailData, PromptsConfig, QueueItem } from "../../shared/types";

export const AUTOMATION_ENABLED: AutomationConfig = { enabled: true, rules: [], batchSize: 5, throttleMs: 0, triageCap: 50 };
export const PROMPTS: PromptsConfig = { customSystemPrompt: null, defaultTone: "chinh-thuc", replyLanguage: "auto" };
export const EMAIL: EmailData = { messageId: "m1", subject: "INVOICE #123", sender: { name: "Boss", email: "boss@x.com" }, to: [], cc: [], bodyText: "nội dung", detectedView: "reading-pane" };

export const analysisOf = (score: number): AnalysisResult =>
  ({ summary: "tổng hợp", importanceScore: score, importanceLabel: score >= 70 ? "cao" : "trung-binh", intent: "hỏi", actions: [], deadline: null, sentiment: "trung lập" });

export const DRAFT_TEXT = "Bản nháp trả lời";

// Port script mặc định: analyze → chunk JSON analysis (score 80) + done; reply → chunk draft + done.
export function defaultScript(analysis: AnalysisResult): (kind: "analyze" | "reply", emit: (event: PortEvent) => void) => void {
  return (kind, emit) => {
    emit({ type: "chunk", requestId: "r", seq: 0, delta: kind === "analyze" ? JSON.stringify(analysis) : DRAFT_TEXT });
    emit({ type: "done", requestId: "r" });
  };
}

export interface Harness {
  deps: AutoModeDeps;
  states: AutoModeState[];
  target: Element; // observeTarget trả về element này (fake object — KHÔNG đụng DOM, CR-C)
  automation: AutomationConfig; //mutable — test bật/tắt enabled (BR-02/FR-GD6-06)
  observer: AutoObserver & { registered: Element[]; disconnects: number };
  mutate: () => void; // trigger callback MutationObserver thủ công
  script: (kind: "analyze" | "reply", emit: (event: PortEvent) => void) => void; // có thể thay giữa chừng
  requestSpy: ReturnType<typeof vi.fn>;
  insertSpy: ReturnType<typeof vi.fn>;
  currentIdSpy: ReturnType<typeof vi.fn>;
  queue: QueueItem[]; // in-memory backing cho listQueue/addToQueue/updateStatus
  cancels: number;
}

export interface HarnessOptions {
  automation?: Partial<AutomationConfig>;
  analysis?: AnalysisResult;
  script?: (kind: "analyze" | "reply", emit: (event: PortEvent) => void) => void;
  insertOutcome?: InsertOutcome;
  insertImpl?: (draft: string, decision?: "replace" | "append") => Promise<InsertOutcome>;
  currentId?: string | null;
  full?: boolean; // addToQueue luôn trả null (mô phỏng QUEUE_MAX đầy — §7.4)
  email?: EmailData;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const automation: AutomationConfig = { ...AUTOMATION_ENABLED, ...options.automation };
  const email = options.email ?? EMAIL;
  const states: AutoModeState[] = [];
  const queue: QueueItem[] = [];
  let seq = 0;
  const target = { role: "fake-inbox-list" } as unknown as Element; // fake — testkit không đụng DOM (CR-C)
  let onMutations: (() => void) | null = null;
  const observer = {
    registered: [] as Element[],
    disconnects: 0,
    observe(targetElement: Element): void {
      observer.registered.push(targetElement);
    },
    disconnect(): void {
      observer.disconnects += 1;
    }
  };
  const harness: Harness = {
    deps: {
      getAutomation: vi.fn(async () => automation),
      getPrompts: vi.fn(async () => PROMPTS),
      readEmail: vi.fn(async () => email),
      observeTarget: vi.fn(async () => target),
      observerFactory: (callback) => {
        onMutations = callback;
        return observer;
      },
      request: (kind, _payload, onEvent) => {
        harness.requestSpy(kind, _payload);
        void (options.script ?? harness.script)(kind, onEvent);
        return { cancel: () => { harness.cancels += 1; } } as StreamHandle;
      },
      insertDraft: options.insertImpl ?? vi.fn(async () => options.insertOutcome ?? ({ kind: "inserted" } as InsertOutcome)),
      currentMessageId: vi.fn(async () => (options.currentId !== undefined ? options.currentId : email.messageId)),
      listQueue: vi.fn(async () => [...queue]),
      addToQueue: vi.fn(async (input: { messageId: string; draft: string }) => {
        if (options.full === true) return null; // QUEUE_MAX 200 — từ chối (§7.4)
        seq += 1;
        const item: QueueItem = { id: "q" + seq, messageId: input.messageId, draft: input.draft, status: "pending", createdAt: new Date(seq).toISOString() };
        queue.push(item);
        return item;
      }),
      updateStatus: vi.fn(async (id: string, status: "approved" | "rejected") => {
        const found = queue.find((item) => item.id === id && item.status === "pending");
        if (!found) return null;
        if (status === "rejected") queue.splice(queue.indexOf(found), 1); // Reject → loại (AF-2)
        else found.status = "approved";
        return { ...found, status: status };
      }),
      schedule: (fn) => fn(), // throttleMs 0 — chạy ngay, deterministic
      onState: (state) => states.push(state)
    },
    states: states,
    target: target,
    automation: automation,
    observer: observer,
    mutate: () => onMutations?.(),
    script: defaultScript(options.analysis ?? analysisOf(80)),
    requestSpy: vi.fn(),
    insertSpy: (options.insertImpl ?? vi.fn()) as ReturnType<typeof vi.fn>,
    currentIdSpy: vi.fn(),
    queue: queue,
    cancels: 0
  };
  return harness;
}

// sync() lần đầu với enabled=true → observer đăng ký; trả controller sẵn sàng nhận mutate().
export async function booted(harness: Harness): Promise<AutoModeController> {
  const controller = new AutoModeController(harness.deps);
  await controller.sync();
  return controller;
}

// Chờ pipeline mutation hoàn tất (processEmail async chạy sau schedule) — poll trên state.
export async function settled(harness: Harness, controller: AutoModeController): Promise<void> {
  await vi.waitFor(() => expect(harness.states[harness.states.length - 1]?.processing).toBe(false));
  await Promise.resolve();
  void controller;
}

// Helpers dùng chung các file automode*.test.ts (noUncheckedIndexedAccess — caller đảm bảo có phần tử).
export const onlyItem = (harness: Harness): QueueItem => harness.queue[0] as QueueItem;
export const lastState = (harness: Harness): AutoModeState => harness.states[harness.states.length - 1] as AutoModeState;
export const kindsOf = (harness: Harness): string[] => harness.requestSpy.mock.calls.map((call) => call[0] as string);
export const queueItem = (id: string, createdAt: number, messageId = "m1"): QueueItem =>
  ({ id: id, messageId: messageId, draft: "draft " + id, status: "pending", createdAt: new Date(createdAt).toISOString() });
