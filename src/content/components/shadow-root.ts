// src/content/components/shadow-root.ts — Shadow DOM isolation (TDD §2.3).
// attachShadow mode "closed" (FR-GD3-05); CSS cô lập 2 chiều qua adoptedStyleSheets + fallback <style>.
// SR-10: chỉ createElement/textContent — không đường innerHTML nào trong src/.
const HOST_ID = "aimh-panel-host";
const HOST_STYLE = "position:fixed;top:16px;right:16px;z-index:2147483647;all:initial;";

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
  "  font-family: inherit; font-size: 11px; color: #5f6368; }"
].join("\n");
