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
import { registerVisionHandlers } from "./handlers/vision.handler";

const router = new MessageRouter();
registerConfigHandlers(router); // GĐ1: CONFIG_GET/SET + KEY_STORAGE_SET thật (BR-04/BR-08/BR-15)
registerConnectionHandlers(router); // GĐ2: TEST_CONNECTION/LIST_MODELS qua registry + adapter (§6.1 #4-5)
registerLocatorHandlers(router); // GĐ3: LOCATOR_RESOLVE (T2)
registerVisionHandlers(router); // GĐ4: VISION_CAPTURE/LOCATE (T3 — BR-03 opt-in)
registerQueueHandlers(router); // stub → GĐ6
registerStateHandlers(router); // GĐ1: GET_RUNTIME_STATE (FR-GD1-02)
router.listen();

const streamServer = new PortServer();
registerStreamHandlers(streamServer); // GĐ2: kind "chat-test" — streaming qua Port (§6.2)
registerReplyHandlers(streamServer); // GĐ4: kind "reply" — UC-02 draft stream
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
