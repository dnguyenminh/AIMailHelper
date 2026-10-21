// src/background/copilot-reader.test.ts — rank/pattern khớp URL Copilot; text trích clone-snapshot.
// 21/10 — thêm: loại sidebar Edge riêng + lọc text node script/style (UAT tự động đêm 20/10).
import { describe, expect, it } from "vitest";
import { COPILOT_EXCLUDE_RE, COPILOT_URL_PATTERN, copilotRank, partsFromSnapshot } from "./copilot-reader";

describe("copilot pattern/rank", () => {
  it("pattern khớp các panel chat OWA (real-id user chỉ chứa GUID — id trùng không cần)", () => {
    expect(COPILOT_URL_PATTERN.test("https://outlook.cloud.microsoft/copilot/sidepanel")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://outlook.office.com/mdc/dcub/freshchat")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://outlook.office.com/hosted/semanticoverview/Users('OID')")).toBe(true);
    expect(COPILOT_URL_PATTERN.test("https://word-view.officeapps.live.com/…/wordviewerframe.aspx")).toBe(false);
  });

  it("21/10: semanticoverview/dcub rank 0 — copilot cloud rank 1 (panel OWA duy nhất đọc được)", () => {
    expect(copilotRank("https://outlook.office.com/hosted/semanticoverview/Users('OID')")).toBe(0);
    expect(copilotRank("https://outlook.office.com/mdc/dcub/chat")).toBe(0);
    expect(copilotRank("https://outlook.cloud.microsoft/copilot")).toBe(1);
    expect(copilotRank("https://outlook.office.com/mdc/optik")).toBe(1);
  });

  it("LOẠI sidebar Copilot riêng của Edge — chrome.debugger.attach bị DENIED (UAT 21/10)", () => {
    expect(COPILOT_EXCLUDE_RE.test("https://copilot.microsoft.com/?PC=ASTS&edgetab=1")).toBe(true);
    expect(COPILOT_EXCLUDE_RE.test("https://outlook.office.com/hosted/semanticoverview/Users('OID')")).toBe(false);
  });
});

// Snapshot mô phỏng: nodeName/nodeValue/parentIndex index vào `strings` như Chromium trả về.
// node: [P][#text "chat"][SCRIPT][#text "script..."][STYLE][#text "css..."]
describe("partsFromSnapshot — lọc <script>/<style> (99% noise của RAW 186k)", () => {
  const strings = ["#text", "SCRIPT", "STYLE", "P", "let x=1; window.report();", "color:red; font:12px;", "Nội dung chat tóm tắt"];
  const snapshot = {
    strings: strings,
    documents: [{
      nodes: {
        nodeName: [3, 0, 1, 0, 2, 0],
        nodeValue: [-1, 6, -1, 4, -1, 5],
        parentIndex: [-1, 0, -1, 2, -1, 4]
      }
    }]
  };

  it("chỉ giữ #text có ancestor hợp lệ — script/style bị loại", () => {
    expect(partsFromSnapshot(snapshot)).toEqual(["Nội dung chat tóm tắt"]);
  });

  it("snapshot thiếu parentIndex → trả đủ (hành vi an toàn như cũ)", () => {
    const noParent = { strings: strings, documents: [{ nodes: { nodeName: [3, 0, 1, 0, 2, 0], nodeValue: [-1, 6, -1, 4, -1, 5] } }] };
    expect(partsFromSnapshot(noParent)).toContain("let x=1; window.report();");
  });

  it("#text rỗng/trim-trống bị bỏ", () => {
    const empty = {
      strings: ["#text", "P", "   "],
      documents: [{ nodes: { nodeName: [1, 0], nodeValue: [-1, 2], parentIndex: [-1, 0] } }]
    };
    expect(partsFromSnapshot(empty)).toEqual([]);
  });
});
