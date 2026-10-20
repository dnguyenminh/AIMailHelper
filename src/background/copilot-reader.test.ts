// src/background/copilot-reader.test.ts — rank/pattern khớp URL Copilot; text trích clone-snapshot.
import { describe, expect, it } from "vitest";
import { COPILOT_URL_PATTERN, copilotRank } from "./copilot-reader";

describe("copilot pattern/rank", () => {
  it("pattern khớp các panel chat OWA (real-id user chỉ chứa GUID — id trùng không cần)", () => {
    expect(COPILOT_URL_PATTERN.test("https://outlook.cloud.microsoft/copilot/sidepanel")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://outlook.office.com/mdc/dcub/freshchat")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://outlook.office.com/hosted/semanticoverview/Users('OID')")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://word-view.officeapps.live.com/…/wordviewerframe.aspx")).toBe(false);
  });

  it("copilotRank: copilot/dcub trước panel phụ", () => {
    expect(copilotRank("https://outlook.cloud.microsoft/copilot")).toBe(0);
    expect(copilotRank("https://outlook.office.com/mdc/optik")).toBe(1);
    expect(copilotRank("https://outlook.cloud.microsoft/myday")).toBe(1);
  });
});
