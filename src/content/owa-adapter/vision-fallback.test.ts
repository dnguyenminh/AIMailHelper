// src/content/owa-adapter/vision-fallback.test.ts — GĐ4 T3 (TDD §3.1.3/§8.7): điều kiện KÉP BR-03 —
// (1) per-call opt-in (allowVision) + (2) config.vision.enabled; thiếu điều kiện nào → 0 capture/
// 0 RPC. Happy path: capture → compress → VISION_LOCATE → parse (x%,y%) → elementFromPoint →
// verifyElement (SR-08). Ảnh KHÔNG persist (storage dump không đổi). parseVisionPoint fail-closed.
import { beforeEach, describe, expect, it } from "vitest";
import { VisionFallback, parseVisionPoint } from "./vision-fallback";
import type { VisionDeps } from "./vision-fallback";
import type { VisionLocateRequest } from "../../shared/llm/prompts-vision";

interface Harness {
  deps: VisionDeps;
  calls: { capture: number; rpc: number };
  requests: VisionLocateRequest[];
  target: HTMLElement;
}

function makeHarness(opts: { enabled?: boolean; allowVision?: boolean; rpcText?: string; element?: Element | null; verifyOk?: boolean }): Harness {
  const calls = { capture: 0, rpc: 0 };
  const requests: VisionLocateRequest[] = [];
  const target = document.body.appendChild(document.createElement("button"));
  target.setAttribute("aria-label", "Trả lời");
  const deps: VisionDeps = {
    configEnabled: async () => opts.enabled ?? false,
    capture: async () => {
      calls.capture += 1;
      return "data:image/jpeg;base64,QUJDREVG";
    },
    compress: async (dataUrl) => ({ dataUrl: dataUrl, width: 1568, height: 800 }),
    locateRpc: async (request) => {
      calls.rpc += 1;
      requests.push(request);
      return { text: opts.rpcText ?? "(42%, 58%)" };
    },
    viewport: () => ({ width: 1000, height: 500 }),
    elementAt: () => opts.element === undefined ? target : opts.element,
    verify: () => opts.verifyOk ?? true
  };
  return { deps: deps, calls: calls, requests: requests, target: target };
}

const KEY = "reply-button" as const;

beforeEach(() => {
  document.body.replaceChildren(); // SR-10 — không dùng innerHTML kể cả trong test
});

describe("BR-03 — điều kiện kép (không thỏa → KHÔNG BAO GIỜ capture)", () => {
  it("vision.enabled=false (mặc định) + allowVision=true → null, capture 0 lần, rpc 0 lần", async () => {
    const harness = makeHarness({ enabled: false });
    const result = await new VisionFallback(harness.deps).resolve(KEY, "nút Reply", true);
    expect(result).toBeNull();
    expect(harness.calls.capture).toBe(0);
    expect(harness.calls.rpc).toBe(0);
  });

  it("enabled=true nhưng allowVision=false (không opt-in per-call) → null, 0 capture", async () => {
    const harness = makeHarness({ enabled: true });
    const fallback = new VisionFallback(harness.deps);
    await expect(fallback.resolve(KEY, "nút Reply")).resolves.toBeNull(); // default false — fail-closed
    await expect(fallback.resolve(KEY, "nút Reply", false)).resolves.toBeNull();
    expect(harness.calls.capture).toBe(0);
  });
});

describe("happy path T3 (enabled + opt-in)", () => {
  it("capture 1 lần → rpc nhận base64/mediaType từ dataURL → elementFromPoint → verify → element", async () => {
    const harness = makeHarness({ enabled: true });
    const result = await new VisionFallback(harness.deps).resolve(KEY, "nút Reply", true);
    expect(result).toBe(harness.target);
    expect(harness.calls.capture).toBe(1);
    expect(harness.calls.rpc).toBe(1);
    expect(harness.requests[0]?.imageBase64).toBe("QUJDREVG"); // tách khỏi dataURL
    expect(harness.requests[0]?.mediaType).toBe("image/jpeg");
    expect(harness.requests[0]?.functionKey).toBe(KEY);
    expect(harness.requests[0]?.question).toBe("nút Reply");
  });

  it("LLM trả 'null' → tier thất bại (không đoán tọa độ)", async () => {
    const harness = makeHarness({ enabled: true, rpcText: "null" });
    await expect(new VisionFallback(harness.deps).resolve(KEY, "q", true)).resolves.toBeNull();
  });

  it("elementFromPoint miss → null; verify fail (SR-08) → null, không trả element sai role", async () => {
    const miss = makeHarness({ enabled: true, element: null });
    await expect(new VisionFallback(miss.deps).resolve(KEY, "q", true)).resolves.toBeNull();
    const wrong = makeHarness({ enabled: true, verifyOk: false });
    await expect(new VisionFallback(wrong.deps).resolve(KEY, "q", true)).resolves.toBeNull();
    expect(wrong.calls.rpc).toBe(1); // đã gọi rpc nhưng kết quả bị từ chối ở verify
  });

  it("KHÔNG persist ảnh: sau resolve, storage sync + local dump không đổi (§8.7/BR-05)", async () => {
    const harness = makeHarness({ enabled: true });
    await new VisionFallback(harness.deps).resolve(KEY, "q", true);
    const areas = globalThis as unknown as { chrome: { storage: { sync: { dump(): Map<string, unknown> }; local: { dump(): Map<string, unknown> } } } };
    expect(areas.chrome.storage.sync.dump().size).toBe(0);
    expect(areas.chrome.storage.local.dump().size).toBe(0);
  });
});

describe("parseVisionPoint — SR-01 L3 fail-closed", () => {
  it.each([
    ["(42%, 58%)", { xPct: 42, yPct: 58 }],
    ["(0%, 100%)", { xPct: 0, yPct: 100 }],
    ["Đây là tọa độ: (37%,52%) — kết thúc", { xPct: 37, yPct: 52 }]
  ])("'%s' → %j", (text, expected) => {
    expect(parseVisionPoint(text)).toEqual(expected);
  });

  it.each(["null", "rubbish", "(120%, 10%)", "(50%)", "", "(abc%, 10%)"])("'%s' → null (text lạ/giới hạn)", (text) => {
    expect(parseVisionPoint(text)).toBeNull();
  });
});
