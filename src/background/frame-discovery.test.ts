// src/background/frame-discovery.test.ts — Edge 155 trả type="other" cho OOPIF (wordviewerframe…)
// — bài học UAT 20/10 run 4: filter cũ chỉ nhận "iframe" → bỏ nhầm toàn bộ frame preview.
import { describe, expect, it } from "vitest";
import { isFrameCandidate, viewerRank } from "./frame-discovery";

function info(type: string, url: string): chrome.debugger.TargetInfo {
  return { id: "target-x", type: type, url: url, attached: false } as unknown as chrome.debugger.TargetInfo;
}

describe("isFrameCandidate", () => {
  it("Chrome OOPIF type=iframe có url → nhận", () => {
    expect(isFrameCandidate(info("iframe", "https://word-view.officeapps.live.com/wv/frame.aspx"))).toBe(true);
  });

  it("Edge 155 type=other + url http → nhận (case thật UAT run 4)", () => {
    expect(isFrameCandidate(info("other", "https://word-view.officeapps.live.com/…/wordviewerframe.aspx"))).toBe(true);
  });

  it("other + blob → nhận; other url rỗng/chrome-extension/devtools → từ chối", () => {
    expect(isFrameCandidate(info("other", "blob:https://owa.test/8f0e"))).toBe(true);
    expect(isFrameCandidate(info("other", ""))).toBe(false);
    expect(isFrameCandidate(info("other", "chrome-extension://hipa/background.js"))).toBe(false);
    expect(isFrameCandidate(info("other", "devtools://devtools/devtools_app.html"))).toBe(false);
  });

  it("worker/page (không phải frame) → từ chối", () => {
    expect(isFrameCandidate(info("worker", "https://outlook.cloud.microsoft/…/sw.js"))).toBe(false);
    expect(isFrameCandidate(info("page", "https://outlook.cloud.microsoft/"))).toBe(false);
  });

  it("viewerRank: frame office viewer đứng trước khác (sort ngắn)", () => {
    expect(viewerRank("https://word-view.officeapps.live.com/…/frame.aspx")).toBe(0);
    expect(viewerRank("https://res.cdn.office.net/img.svg")).toBe(1);
    expect(viewerRank("https://outlook.office.com/hosted/semanticoverview")).toBe(1);
  });
});
