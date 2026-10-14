// src/content/modules/automode-deps.ts — default deps cho AutoModeController (TDD §4.4).
// Tách khỏi automode.ts (file ≤ 200 dòng — §1.4 #7): adapter facade + PortClient + queue-store;
// config.automation đổi qua Options (storage.onChanged) → sync() lại — cổng bật/tắt observer
// DUY NHẤT (BR-02 — KHÔNG tồn tại code path nào bật auto-mode ngoài AutomationSettings + confirm).
import { PortClient } from "../../shared/port-client";
import { addToQueue, listQueue, updateQueueStatus } from "../../shared/queue-store";
import { storage } from "../../shared/storage";
import { owaAdapter } from "../owa-adapter/owa-adapter";
import type { AutoModeState, ObserverFactory } from "./automode-types";
import { AutoModeController } from "./automode";

// BR-02 — observer chỉ sống trong closure này; disconnect() → không còn tham chiếu nào.
const DEFAULT_OBSERVER: ObserverFactory = (onMutations) => {
  const observer = new MutationObserver(() => onMutations());
  return {
    observe: (target) => observer.observe(target, { childList: true, subtree: true }),
    disconnect: () => observer.disconnect()
  };
};

export function createAutoModeController(onState: (state: AutoModeState) => void): AutoModeController {
  const client = new PortClient();
  const controller = new AutoModeController({
    getAutomation: () => storage.getAutomation(),
    getPrompts: () => storage.getPrompts(),
    readEmail: () => owaAdapter.readEmail(),
    observeTarget: () => owaAdapter.locate("inbox-list", "danh sách inbox hiện tại"),
    observerFactory: DEFAULT_OBSERVER,
    request: (kind, payload, onEvent) => client.request(kind, payload, onEvent),
    insertDraft: (draft, decision) => owaAdapter.insertDraft(draft, decision),
    currentMessageId: async () => {
      try {
        return (await owaAdapter.readEmail()).messageId;
      } catch {
        return null; // không đọc được email hiện tại → EF-5 coi như không xác minh được
      }
    },
    listQueue: () => listQueue(),
    addToQueue: (input) => addToQueue(input),
    updateStatus: (id, status) => updateQueueStatus(id, status),
    schedule: (fn, delayMs) => {
      setTimeout(fn, delayMs);
    },
    onState: onState
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes["config.automation"] !== undefined) void controller.sync();
  });
  return controller;
}
