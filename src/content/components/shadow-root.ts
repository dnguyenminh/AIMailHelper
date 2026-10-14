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
  ".aimh-panel-note { margin: 0; color: #5f6368; font-size: 12px; }"
].join("\n");
