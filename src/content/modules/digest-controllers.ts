// src/content/modules/digest-controllers.ts — uat80: factory + deps wiring của 2 controller
// triage (tách khỏi digest.ts để giữ ≤200 dòng). Deps dùng chung (PortClient + adapter + cache
// GĐ5; vision opt-out BR-03) — cả 2 dùng quét SÂU (cuộn dần ảo hóa, KHÔNG đổi trạng thái đã đọc).
// uat80: unread collector nhận opts { full } — "Quét lại" bỏ watermark; quét thường có watermark.
import { defaultSleep } from "./digest-batch";
import type { InboxItem, LocateFn } from "../owa-adapter/triage";
import { collectUnreadItemsDeep } from "../owa-adapter/deep-triage";
import { collectUnreadItems, hasFolderChanged as folderChangedFn, readFolderSignature } from "../owa-adapter/triage";
import { getTriageMany, setTriageMany } from "../owa-adapter/triage-cache";
import { owaAdapter } from "../owa-adapter/owa-adapter";
import type { TriageDeps, TriageUiState } from "./digest-types";
import { TriageController } from "./digest";
import { PortClient } from "../../shared/port-client";
import { storage } from "../../shared/storage";

function baseDeps(
  collect: (locate: LocateFn, opts?: { full?: boolean }) => Promise<InboxItem[]>,
  onState: (state: TriageUiState) => void
): TriageDeps {
  const client = new PortClient();
  const locate = (key: Parameters<typeof owaAdapter.locate>[0], question: string) => owaAdapter.locate(key, question);
  return {
    collectItems: (opts) => collect(locate, opts), folderSignature: () => readFolderSignature(locate),
    hasFolderChanged: (before) => folderChangedFn(before, locate),
    getCached: (ids) => getTriageMany(ids), saveScores: (scores) => setTriageMany(scores),
    attachBadge: (messageId, score) => owaAdapter.attachBadge(messageId, score),
    getAutomation: () => storage.getAutomation(),
    collectUnreadTop: () => collectUnreadItems(locate),
    request: (batch, onEvent) => client.request("triage-batch", { items: batch }, onEvent),
    sleep: defaultSleep, onState: onState
  };
}

export function createTriageController(onState: (state: TriageUiState) => void): TriageController {
  return new TriageController(baseDeps((_locate, _opts) => owaAdapter.collectInboxItemsDeep(), onState));
}

export function createUnreadTriageController(onState: (state: TriageUiState) => void): TriageController {
  return new TriageController(baseDeps((locate, opts) => collectUnreadItemsDeep(locate, undefined, opts), onState));
}
