// src/background/service-worker.ts — entry SW (TDD §4.1): listeners đồng bộ top-level, migration on wake.
// MV3 non-persistent (~30s idle): mọi listener đăng ký lúc evaluate module để không bỏ sót event (§2.5).
import { PortServer } from "../shared/port-server";
import { migrateIfNeeded } from "../shared/storage";
import { MessageRouter } from "./router";
import { registerConfigHandlers } from "./handlers/config.handler";
import { registerConnectionHandlers } from "./handlers/connection.handler";
import { registerLocatorHandlers } from "./handlers/locator.handler";
import { registerQueueHandlers } from "./handlers/queue.handler";
import { registerStateHandlers } from "./handlers/state.handler";
import { registerStreamHandlers } from "./handlers/stream.handler";
import { registerReplyHandlers } from "./handlers/reply.handler";
import { registerTriageHandlers } from "./handlers/triage.handler";
import { registerVisionHandlers } from "./handlers/vision.handler";
import { registerDebuggerHandlers } from "./handlers/debugger.handler";
import { registerAttachmentHandlers } from "./handlers/attachment.handler";
import { registerCopilotHandlers } from "./handlers/copilot.handler";

const router = new MessageRouter();
registerConfigHandlers(router); // GĐ1: CONFIG_GET/SET + KEY_STORAGE_SET thật (BR-04/BR-08/BR-15)
registerConnectionHandlers(router); // GĐ2: TEST_CONNECTION/LIST_MODELS qua registry + adapter (§6.1 #4-5)
registerLocatorHandlers(router); // GĐ3: LOCATOR_RESOLVE (T2)
registerVisionHandlers(router); // GĐ4: VISION_CAPTURE/LOCATE (T3 — BR-03 opt-in)
registerQueueHandlers(router); // GĐ6: QUEUE_LIST/UPDATE thật (BR-15 validate; chèn ở CS — BR-01)
registerStateHandlers(router); // GĐ1: GET_RUNTIME_STATE (FR-GD1-02)
registerDebuggerHandlers(router); // UAT 18/10: DEBUGGER_SCROLL/DETACH — trusted-scroll deep-scan
registerAttachmentHandlers(router); // UAT 18/10 Plan A: capture + extract attachment cho AI
registerCopilotHandlers(router); // GĐ-A 20/10: COPIL_PANEL_READ + COPIL_CHIP_CLICK (21/10) qua CDP
router.listen();

const streamServer = new PortServer();
registerStreamHandlers(streamServer); // GĐ2: kind "chat-test" — streaming qua Port (§6.2)
registerReplyHandlers(streamServer); // GĐ4: kind "reply" — UC-02 draft stream
registerTriageHandlers(streamServer); // GĐ5: kind "triage-batch" — UC-03 (progress §6.2 #7)
streamServer.attach();

chrome.runtime.onInstalled.addListener(() => {
  void runMigration("onInstalled");
});
chrome.runtime.onStartup.addListener(() => {
  void runMigration("onStartup");
});
void runMigration("wake"); // SW wake bởi message — migration idempotent nên chạy lại an toàn (§6.3.1)

// §6.3.1 #3: migration fail → log ERR + dừng (giữ nguyên dữ liệu, không xóa apiKey — BR-04).
async function runMigration(trigger: string): Promise<void> {
  try {
    await migrateIfNeeded();
  } catch (error) {
    console.error("[AIMH][sw] migration failed (" + trigger + ")", error);
  }
}
