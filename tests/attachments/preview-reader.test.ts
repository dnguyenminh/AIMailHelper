// tests/attachments/preview-reader.test.ts — UAT 18/10 (user): Word/Excel Online render text
// trong iframe cross-origin — extension đọc qua debugger DOMSnapshot (chỉ-đọc, không evaluate).
// Test: textFromSnapshot gộp text node + lọc empty; handler READ_PREVIEW sender-tab only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeMock } from "../mocks/chrome";
import type { ChromeMock } from "../mocks/chrome";
import { MessageRouter } from "../../src/background/router";
import { registerAttachmentHandlers } from "../../src/background/handlers/attachment.handler";
import { textFromSnapshot } from "../../src/background/preview-reader";
import { resetSessionsForTests } from "../../src/background/debugger-scroll";
import type { RpcResponse } from "../../src/shared/messaging";

type Chrome = { chrome: ChromeMock & Record<string, unknown> };

const OWA_TAB = { id: 7, url: "https://outlook.cloud.microsoft/mail/inbox" };

function snapshotFixture(texts: string[]): unknown {
  const strings: string[] = [];
  const nodeName: number[] = [];
  const nodeValue: number[] = [];
  for (const text of texts) {
    nodeName.push(strings.push("#text") - 1);
    nodeValue.push(strings.push(text) - 1);
  }
  nodeName.push(strings.push("DIV") - 1);
  nodeValue.push(-1);
  return { strings: strings, documents: [{ nodes: { nodeName: nodeName, nodeValue: nodeValue } }] };
}

beforeEach(() => {
  const mock = createChromeMock() as ChromeMock & Record<string, unknown>;
  mock.debugger = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    sendCommand: vi.fn((_target: unknown, method: string, _params: unknown, cb?: (r: unknown) => void) => {
      const fixture = method === "DOMSnapshot.captureSnapshot"
        ? snapshotFixture(["HĐ_DV_102026", "Nội dung hợp đồng dịch vụ", "  ", "Điều 1: phạm vi"])
        : undefined;
      if (typeof cb === "function") cb(fixture); // callback-style (preview-reader)
      return Promise.resolve(fixture); // promise-style (debugger-scroll)
    }),
    getTargets: vi.fn((cb: (t: unknown[]) => void) => cb([
      { id: "frame1", type: "iframe", url: "https://word-view.officeapps.live.com/wv/wordviewerframe.aspx", attached: false },
      { id: "noise", type: "iframe", url: "https://outlook.cloud.microsoft/x", attached: false }
    ])),
    onDetach: { addListener: vi.fn() },
    onEvent: { addListener: vi.fn() }
  };
  (globalThis as unknown as Chrome).chrome = mock;
  resetSessionsForTests();
  vi.restoreAllMocks();
});

describe("textFromSnapshot — parser DOMSnapshot (thuần, không cần CDP)", () => {
  it("gộp TẤT CẢ text node, bỏ empty + chuẩn hóa khoảng trắng", () => {
    const text = textFromSnapshot(snapshotFixture(["HĐ_DV_102026", "Nội dung", "   ", "Điều 1"]));
    expect(text).toBe("HĐ_DV_102026 Nội dung Điều 1");
  });

  it("snapshot rỗng / sai cấu trúc → chuỗi rỗng (fail-open — caller fallback bytes)", () => {
    expect(textFromSnapshot({})).toBe("");
    expect(textFromSnapshot(null)).toBe("");
  });
});

describe("ATTACHMENT_READ_PREVIEW — đọc text render trong iframe Office Online", () => {
  async function callPreview(sender: unknown): Promise<RpcResponse<unknown>> {
    const router = new MessageRouter();
    registerAttachmentHandlers(router);
    return router.handle({ kind: "ATTACHMENT_READ_PREVIEW", requestId: "rpc_t", payload: {} }, sender as chrome.runtime.MessageSender) as Promise<RpcResponse<unknown>>;
  }

  it("đọc đúng CHỈ iframe officeapps (bỏ frame noise) — text đã render", async () => {
    const response = await callPreview({ tab: OWA_TAB });
    expect(response.ok).toBe(true);
    const text = (response as { data: { text: string } }).data.text;
    expect(text).toContain("HĐ_DV_102026");
    expect(text).toContain("Điều 1: phạm vi");
    const dbg = (globalThis as unknown as Chrome).chrome.debugger as { attach: ReturnType<typeof vi.fn> };
    const frameAttaches = dbg.attach.mock.calls.filter((c) => (c[0] as { targetId?: string }).targetId !== undefined);
    expect(frameAttaches).toHaveLength(1); // chỉ frame1 — noise bị lọc
    expect((frameAttaches[0]?.[0] as { targetId: string }).targetId).toBe("frame1");
  });

  it("không có sender.tab → ERR-15 (SR-12 — không tin tabId từ payload)", async () => {
    const response = await callPreview(undefined);
    expect(response.ok).toBe(false);
    expect((response as { error: { code: string } }).error.code).toBe("ERR-15");
  });

  it("tab không phải OWA → ERR-15, không attach iframe nào", async () => {
    const response = await callPreview({ tab: { id: 7, url: "https://evil.example.com/x" } });
    expect(response.ok).toBe(false);
    const dbg = (globalThis as unknown as Chrome).chrome.debugger as { attach: ReturnType<typeof vi.fn> };
    expect(dbg.attach).not.toHaveBeenCalled();
  });
});
