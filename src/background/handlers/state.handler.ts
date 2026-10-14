// src/background/handlers/state.handler.ts — GET_RUNTIME_STATE (TDD §6.1 #9; FR-GD1-02).
// Đọc từ storage qua wrapper (BR-15) — không cache stale trong SW.
import { storage } from "../../shared/storage";
import type { RuntimeState } from "../../shared/types";
import type { MessageRouter, RpcHandler } from "../router";

export function registerStateHandlers(router: MessageRouter): void {
  router.register("GET_RUNTIME_STATE", handleGetRuntimeState);
}

const handleGetRuntimeState: RpcHandler = async (): Promise<RuntimeState> => {
  const [general, activeProvider, automation] = await Promise.all([
    storage.getGeneral(),
    storage.getActiveProvider(),
    storage.getAutomation()
  ]);
  return {
    extensionEnabled: general.extensionEnabled,
    providerActive: activeProvider,
    autoModeEnabled: automation.enabled
  };
};
