// src/content/modules/digest.ts — UC-03/UC-04 orchestration (TDD §3.7; FSD 6.6d; FR-GD5-01..06).
// collect (BR-07) → cache (BR-09) → cap 50 → batch+throttle → retry → cache GỘP + Digest sort
// score giảm dần (FR-GD5-04); EF-2/EF-4 dừng an toàn; AF-5 quét tiếp; AF-2 quét lại bỏ cache.
import type { TriageScore } from "../../shared/types";
import type { AutomationConfig } from "../../shared/types";
import { PortClient } from "../../shared/port-client";
import { storage } from "../../shared/storage";
import type { InboxItem, LocateFn } from "../owa-adapter/triage";
import { collectUnreadItemsDeep } from "../owa-adapter/deep-triage";
import { hasFolderChanged as folderChangedFn, readFolderSignature } from "../owa-adapter/triage";
import { getTriageMany, setTriageMany } from "../owa-adapter/triage-cache";
import { owaAdapter } from "../owa-adapter/owa-adapter";
import type { BatchError } from "./digest-batch";
import { defaultSleep, runBatchWithRetry } from "./digest-batch";
import { chunks, entriesFromCached, idsOf, toTriageError, upsertDigest } from "./digest-helpers";
import type { DigestEntry, TriageDeps, TriageError, TriageUiState } from "./digest-types";

export type { DigestEntry, TriageDeps, TriageError, TriageProgress, TriageUiState } from "./digest-types";

const IDLE: TriageUiState = {
  status: "idle", progress: { done: 0, total: 0, failed: 0 }, cachedSkipped: 0, cap: 0,
  overflow: 0, folderStopped: false, userStopped: false, error: null, digest: []
};

interface ScanContext {
  visible: InboxItem[];
  config: AutomationConfig;
  cachedSkipped: number;
  overflow: number;
  todo: InboxItem[];
  digest: DigestEntry[];
  done: number;
  failed: number;
  folderStopped: boolean;
  userStopped: boolean;
  lastError: TriageError | null;
}

export class TriageController {
  private state: TriageUiState = IDLE;
  private signature: Element | null = null;
  private scan: ScanContext | null = null;
  private currentRun: { cancel: () => void } | null = null;

  constructor(private readonly deps: TriageDeps) {}

  // UC-03 bước 1-6 — AF-2: force bỏ cache; keepDigest: giữ kết quả cũ (AF-5 "Quét tiếp").
  async start(options: { force?: boolean; keepDigest?: boolean } = {}): Promise<void> {
    this.currentRun?.cancel();
    this.currentRun = null;
    this.signature = await this.deps.folderSignature();
    let items: InboxItem[];
    try {
      items = await this.deps.collectItems(); // BR-07 + ERR-12 lọc sẵn trong triage.ts
    } catch (error) {
      this.scan = null;
      this.setState({ ...IDLE, status: "error", error: toTriageError(error) });
      return;
    }
    const config = await this.deps.getAutomation();
    const cached = options.force === true ? new Map<string, TriageScore>() : await this.deps.getCached(idsOf(items));
    for (const item of items) {
      const hit = cached.get(item.messageId);
      if (hit !== undefined) this.deps.attachBadge(item.messageId, hit.score); // AF-1 UC-03
    }
    const todo = items.filter((item) => !cached.has(item.messageId));
    const overflow = Math.max(0, todo.length - config.triageCap); // EF-5 — dừng ở cap (#10)
    this.scan = {
      visible: items, config: config, cachedSkipped: cached.size, overflow: overflow,
      todo: todo.slice(0, config.triageCap), digest: options.keepDigest === true ? [...this.state.digest] : entriesFromCached(items, cached),
      done: cached.size, failed: 0, folderStopped: false, userStopped: false, lastError: null
    };
    this.setState({
      status: "running", progress: { done: cached.size, total: items.length, failed: 0 },
      cachedSkipped: cached.size, cap: config.triageCap, overflow: overflow,
      folderStopped: false, userStopped: false, error: null, digest: [...this.scan.digest]
    });
    await this.runBatches();
  }

  // AF-5 — quét phần mới hiển thị, giữ kết quả cũ (item đã cache không tốn token — BR-09).
  scanMore(): Promise<void> {
    return this.start({ keepDigest: true });
  }

  // AF-2 — quét lại bỏ cache (gọi LLM lại cho toàn bộ item hiển thị).
  rescan(): Promise<void> {
    return this.start({ force: true });
  }

  // Dừng chủ động — batch đang chạy bị hủy + loop dừng, kết quả đã có được giữ (EF-3).
  cancel(): void {
    this.currentRun?.cancel();
    this.currentRun = null;
  }

  // 6.6d outer loop — folderChanged() TRƯỚC MỖI batch → dừng an toàn giữ kết quả (EF-2/EF-4).
  private async runBatches(): Promise<void> {
    const scan = this.scan;
    if (scan === null) return;
    const batches = chunks(scan.todo, scan.config.batchSize);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index] as InboxItem[];
      if (await this.deps.hasFolderChanged(this.signature)) {
        scan.folderStopped = true; // EF-2/EF-4 — dừng an toàn, giữ kết quả đã có
        break;
      }
      const run = runBatchWithRetry(this.deps.request, batch, scan.config.throttleMs, this.deps.sleep);
      this.currentRun = run;
      const result = await run.promise;
      this.currentRun = null;
      if (result.cancelled) {
        scan.userStopped = true; // EF-3 — giữ kết quả đã có
        break;
      }
      this.applyBatchResult(scan, batch, result);
      this.emitRunning(scan);
      if (index < batches.length - 1) {
        await this.deps.sleep(scan.config.throttleMs); // throttle GIỮA các batch (6.6d — không chờ sau batch cuối)
      }
    }
    this.finish(scan);
  }

  // Thành công → cache GỘP + badge + Digest; lỗi → item "chưa chấm", batch sau vẫn chạy (EF-3).
  private applyBatchResult(scan: ScanContext, batch: InboxItem[], result: { scores: TriageScore[]; error: BatchError | null }): void {
    if (result.error !== null) {
      scan.failed += batch.length; // hết lượt retry → "chưa chấm" (EF-3 UC-03)
      scan.lastError = { code: result.error.code, i18nKey: result.error.i18nKey, params: result.error.params };
      return;
    }
    this.persistScores(scan, result.scores);
    for (const score of result.scores) {
      this.deps.attachBadge(score.messageId, score.score); // FR-GD5-03
      upsertDigest(scan.digest, score, scan.visible);
    }
    scan.done += result.scores.length;
    scan.failed += batch.length - result.scores.length; // TD-8/FR-GD5-06 — phần bị reject
  }

  // §3.3 — cache ghi GỘP batch; ERR-08 (quota) → thông báo, giữ dữ liệu cũ, KHÔNG mất key (EF-4).
  private async persistScores(scan: ScanContext, scores: TriageScore[]): Promise<void> {
    try {
      await this.deps.saveScores(scores);
    } catch (error) {
      scan.lastError = toTriageError(error); // ERR-08 — EF-4 UC-03
    }
  }

  private emitRunning(scan: ScanContext): void {
    this.setState({
      status: "running", progress: { done: scan.done, total: scan.visible.length, failed: scan.failed },
      cachedSkipped: scan.cachedSkipped, cap: scan.config.triageCap, overflow: scan.overflow,
      folderStopped: scan.folderStopped, userStopped: scan.userStopped, error: scan.lastError,
      digest: [...scan.digest]
    });
  }

  private finish(scan: ScanContext): void {
    this.scan = null;
    this.setState({
      status: "done", progress: { done: scan.done, total: scan.visible.length, failed: scan.failed },
      cachedSkipped: scan.cachedSkipped, cap: scan.config.triageCap, overflow: scan.overflow,
      folderStopped: scan.folderStopped, userStopped: scan.userStopped, error: scan.lastError,
      digest: [...scan.digest]
    });
  }

  private setState(state: TriageUiState): void {
    this.state = state;
    this.deps.onState(state);
  }

  getState(): TriageUiState {
    return this.state;
  }
}

// Deps dùng chung (PortClient + adapter + cache GĐ5; vision opt-out BR-03) — UAT 17/10: cả 2 controller dùng quét SÂU (cuộn dần ảo hóa, KHÔNG đổi trạng thái đã đọc).
function baseDeps(collect: (locate: LocateFn) => Promise<InboxItem[]>, onState: (state: TriageUiState) => void): TriageDeps {
  const client = new PortClient();
  const locate = (key: Parameters<typeof owaAdapter.locate>[0], question: string) => owaAdapter.locate(key, question);
  return {
    collectItems: () => collect(locate), folderSignature: () => readFolderSignature(locate),
    hasFolderChanged: (before) => folderChangedFn(before, locate),
    getCached: (ids) => getTriageMany(ids), saveScores: (scores) => setTriageMany(scores),
    attachBadge: (messageId, score) => owaAdapter.attachBadge(messageId, score),
    getAutomation: () => storage.getAutomation(),
    request: (batch, onEvent) => client.request("triage-batch", { items: batch }, onEvent),
    sleep: defaultSleep, onState: onState
  };
}

export function createTriageController(onState: (state: TriageUiState) => void): TriageController {
  return new TriageController(baseDeps(() => owaAdapter.collectInboxItemsDeep(), onState));
}
export function createUnreadTriageController(onState: (state: TriageUiState) => void): TriageController {
  return new TriageController(baseDeps((locate) => collectUnreadItemsDeep(locate), onState));
}
