// src/shared/llm/registry.test.ts — Registry/Factory (GĐ2): 6 adapter instance đúng id;
// adapter stateless (2 call liên tiếp không tham nhiễu — UC-05 EF-6 config snapshot).
import { describe, expect, it } from "vitest";
import { createLLMRegistry, llmRegistry } from "./registry";
import { PROVIDER_IDS } from "../storage-schema";
import type { ChatMessage, LLMConfig } from "./types";

describe("LLMRegistry — Factory/Registry (TDD §3.2)", () => {
  it("get(id) trả adapter instance với id khớp cho đủ 6 provider", () => {
    for (const id of PROVIDER_IDS) {
      const adapter = llmRegistry.get(id);
      expect(adapter.id).toBe(id);
      expect(typeof adapter.chat).toBe("function");
      expect(typeof adapter.chatStream).toBe("function");
      expect(typeof adapter.listModels).toBe("function");
      expect(typeof adapter.testConnection).toBe("function");
    }
  });

  it("createLLMRegistry() tạo registry độc lập (không chia sẻ state với singleton)", () => {
    const other = createLLMRegistry();
    expect(other.get("openai")).not.toBe(llmRegistry.get("openai"));
    expect(other.get("openai").id).toBe(llmRegistry.get("openai").id);
  });

  it("adapter stateless: 2 call với config khác nhau dùng đúng config từng call (EF-6)", async () => {
    const adapter = llmRegistry.get("azure");
    const first: LLMConfig = {
      provider: "azure", apiKey: "a".repeat(32), model: "m",
      azure: { endpoint: "https://r1.openai.azure.com", deployment: "d1", apiVersion: "2024-10-21" }
    };
    const second: LLMConfig = {
      provider: "azure", apiKey: "b".repeat(32), model: "m",
      azure: { endpoint: "https://r2.openai.azure.com", deployment: "d2", apiVersion: "2024-06-01" }
    };
    const { stubFetch, nthCall, queueResponse, jsonResponse } = await import("../../../tests/llm/helpers");
    const { mock } = stubFetch();
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "x" }, finish_reason: "stop" }] }));
    queueResponse(mock, jsonResponse({ choices: [{ message: { content: "y" }, finish_reason: "stop" }] }));
    const messages: ChatMessage[] = [{ role: "user", content: "u" }];
    await adapter.chat(first, messages);
    await adapter.chat(second, messages);
    expect(nthCall(mock, 0).url).toContain("r1.openai.azure.com");
    expect(nthCall(mock, 0).headers["api-key"]).toBe(first.apiKey);
    expect(nthCall(mock, 1).url).toContain("r2.openai.azure.com");
    expect(nthCall(mock, 1).headers["api-key"]).toBe(second.apiKey); // snapshot không đổi giữa call
  });
});
