// src/content/components/shadow-root.ts — Shadow DOM isolation (TDD §2.3).
// attachShadow mode "closed" (FR-GD3-05); CSS cô lập 2 chiều qua adoptedStyleSheets + fallback <style>.
// SR-10: chỉ createElement/textContent — không đường innerHTML nào trong src/.
const HOST_ID = "aimh-panel-host";
const HOST_STYLE = "all:initial;display:block;position:fixed;top:16px;right:16px;z-index:2147483647;"; // all:initial ĐỨNG TRƯỚC — nếu đứng sau nó xóa position/tọa độ (UAT bug 15/10)

export interface ShadowMount {
  host: HTMLDivElement;
  shadow: ShadowRoot;
}

export function createShadowHost(target: ParentNode = document.body): ShadowMount {
  const host = document.createElement("div"); // SR-10 — DOM API an toàn
  host.id = HOST_ID;
  host.style.cssText = HOST_STYLE; // tránh kế thừa style OWA (§2.3)
  target.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" }); // closed — OWA script không can thiệp được
  return { host: host, shadow: shadow };
}

// Constructed stylesheet trước (Chrome/Edge hiện đại), fallback <style> cho Edge cũ (§2.3).
export function adoptStyles(shadow: ShadowRoot, css: string): void {
  const supportsConstructed = typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype;
  if (supportsConstructed && "adoptedStyleSheets" in shadow) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    return;
  }
  const style = document.createElement("style"); // fallback — vẫn textContent (SR-10)
  style.textContent = css;
  shadow.appendChild(style);
}

export const PANEL_BASE_CSS = [
  ":host { all: initial; }",
  ".aimh-panel {",
  "  display: flex; flex-direction: column; gap: 4px;",
  "  min-width: 220px; padding: 12px; border-radius: 8px;",
  "  background: #ffffff; color: #1b1b1f;",
  "  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);",
  "  font-family: system-ui, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.45;",
  "}",
  ".aimh-panel-title { margin: 0; font-weight: 600; font-size: 13px; }",
  ".aimh-panel-note { margin: 0; color: #5f6368; font-size: 12px; }",
  // GĐ3 — panel actions + analysis views
  ".aimh-panel-actions { display: flex; gap: 6px; flex-wrap: wrap; }",
  ".aimh-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #d1d1d7;",
  "  background: #ffffff; color: #1b1b1f; font: inherit; cursor: pointer; }",
  ".aimh-btn:disabled { opacity: 0.55; cursor: not-allowed; }",
  ".aimh-btn-primary { background: #0f6cbd; border-color: #0f6cbd; color: #ffffff; }",
  // UAT — loading feedback: spinner khi async đang chạy + disabled chống double-click
  ".aimh-btn-loading { position: relative; pointer-events: none; opacity: 0.7; }",
  ".aimh-btn-loading::after { content: ''; position: absolute; right: 6px; top: 50%; width: 10px; height: 10px; margin-top: -5px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.2); border-top-color: currentColor; animation: aimh-spin 0.7s linear infinite; }",
  "@keyframes aimh-spin { to { transform: rotate(360deg); } }",
  ".aimh-consent { padding: 8px; border-radius: 6px; background: #fff4ce; display: flex;",
  "  flex-direction: column; gap: 6px; }",
  ".aimh-note { margin: 0; color: #5f6368; font-size: 12px; }",
  ".aimh-stream { margin: 0; padding: 8px; border-radius: 6px; background: #f5f5f7;",
  "  white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto;",
  "  font-family: inherit; font-size: 12px; }",
  ".aimh-analysis { display: flex; flex-direction: column; gap: 6px; }",
  ".aimh-analysis section { display: flex; flex-direction: column; gap: 2px; }",
  ".aimh-heading { margin: 0; font-size: 11px; font-weight: 600; color: #5f6368;",
  "  text-transform: uppercase; letter-spacing: 0.4px; }",
  ".aimh-text { margin: 0; font-size: 13px; }",
  ".aimh-muted { color: #8a8886; }",
  ".aimh-badge { display: inline-block; padding: 1px 8px; border-radius: 999px;",
  "  font-size: 11px; font-weight: 600; color: #ffffff; }",
  ".aimh-badge-high { background: #a4262c; }",
  ".aimh-badge-medium { background: #8a6116; }",
  ".aimh-badge-low { background: #107c10; }",
  ".aimh-score { margin-left: 6px; color: #5f6368; font-size: 12px; }",
  ".aimh-list { margin: 0; padding-left: 18px; font-size: 13px; }",
  ".aimh-error { padding: 8px; border-radius: 6px; background: #fde7e9; display: flex;",
  "  flex-direction: column; gap: 6px; }",
  ".aimh-error-msg { margin: 0; color: #a4262c; font-size: 12px; }",
  ".aimh-error-raw { margin: 0; padding: 6px; border-radius: 4px; background: #ffffff;",
  "  max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word;",
  "  font-family: inherit; font-size: 11px; color: #5f6368; }",
  // GĐ4 — reply composer + diagnose + warning dialogs
  ".aimh-reply { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #e1e1e5;",
  "  padding-top: 8px; }",
  ".aimh-row { display: flex; gap: 6px; }",
  ".aimh-input { flex: 1; padding: 4px 6px; border-radius: 4px; border: 1px solid #d1d1d7;",
  "  background: #ffffff; color: #1b1b1f; font: inherit; font-size: 12px; min-width: 0; }",
  ".aimh-warning { padding: 8px; border-radius: 6px; background: #fff4ce; display: flex;",
  "  flex-direction: column; gap: 6px; }",
  ".aimh-diagnose { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #e1e1e5;",
  "  padding-top: 8px; }",
  ".aimh-report { max-height: 200px; overflow: auto; white-space: pre; font-family: monospace;",
  "  font-size: 11px; }",
  // GĐ5 — triage + Digest (FSD 3.4 màn 4)
  ".aimh-digest { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #e1e1e5;",
  "  padding-top: 8px; }",
  ".aimh-digest-list { max-height: 220px; overflow: auto; display: flex; flex-direction: column;",
  "  gap: 4px; }",
  // UAT — window chrome: panel như cửa sổ (kéo thả qua titlebar, thu nhỏ/ẩn, resize góc phải dưới)
  ".aimh-panel { resize: both; overflow: auto; max-height: 80vh; max-width: 480px; min-width: 230px;",
  "  min-height: 96px; }",
  ".aimh-titlebar { display: flex; align-items: center; justify-content: space-between;",
  "  cursor: move; user-select: none; touch-action: none; padding-bottom: 6px; }",
  ".aimh-titlebar .aimh-panel-title { pointer-events: none; }",
  ".aimh-winbtns { display: flex; gap: 2px; }",
  ".aimh-winbtns button { border: none; background: transparent; color: #5f6368; cursor: pointer;",
  "  font-size: 13px; line-height: 1; padding: 2px 5px; border-radius: 4px; font-family: inherit; }",
  ".aimh-winbtns button:hover { background: #e8eaed; color: #1b1b1f; }",
  ".aimh-body { display: flex; flex-direction: column; gap: 4px; }",
  ".aimh-bubble { width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;",
  "  background: #0f6cbd; color: #ffffff; font-size: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.24); }",
  ".aimh-bubble:hover { background: #115ea3; }",
  // 21/10 uat60 — Copilot markdown render (heading/bullet/link/table giữ format chat)
  ".aimh-md { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px;",
  "  max-height: 260px; overflow: auto; padding: 8px; border-radius: 6px; background: #f5f5f7; }",
  ".aimh-md-h { font-weight: 600; margin-top: 2px; }",
  ".aimh-md-h1 { font-size: 15px; } .aimh-md-h2 { font-size: 14px; }",
  ".aimh-md-h3 { font-size: 13.5px; } .aimh-md-h4 { font-size: 13px; }",
  ".aimh-md-h5, .aimh-md-h6 { font-size: 12.5px; }",
  ".aimh-md-p { margin: 0; }",
  ".aimh-md-ul, .aimh-md-ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; }",
  ".aimh-md-pre, .aimh-md-code { font-family: Consolas, monospace; font-size: 11.5px;",
  "  background: #ececf0; border-radius: 4px; }",
  ".aimh-md-pre { padding: 6px 8px; overflow: auto; white-space: pre-wrap; }",
  ".aimh-md-code { padding: 1px 4px; }",
  ".aimh-md-quote { margin: 0; padding: 2px 10px; border-left: 3px solid #c7c7cc; color: #5f6368; }",
  ".aimh-md-a { color: #0f6cbd; word-break: break-word; }",
  ".aimh-md-tablewrap { overflow: auto; }",
  ".aimh-md-table { border-collapse: collapse; font-size: 11.5px; }",
  ".aimh-md-table td { border: 1px solid #d1d1d7; padding: 3px 6px; vertical-align: top; }"
].join("\n");
