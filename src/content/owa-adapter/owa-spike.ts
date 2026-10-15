// src/content/owa-adapter/owa-spike.ts — UAT SPIKE (15/10): dữ liệu cấu trúc OWA mới
// (outlook.cloud.microsoft) cho fix reader/selectors. CHỈ cấu trúc: tag/role/aria + độ dài
// text + anchor 40 ký tự đầu. normalizeLabel + resolveBySelectorsFromChain sống ở đây
// (diagnose import từ đây — 1 chiều, không circular). Tách khỏi diagnose.ts (≤200 dòng).
import { SELECTOR_CHAINS, type SelectorChain } from "./selectors";

// Label chức năng giữ lại trong report — pattern ĐÓNG so khớp trên dạng ĐÃ BỎ DẤU (NFD strip +
// đ→d + lowercase — "Trả lời" → "tra loi"; ký tự Việt precomposed không match được bằng class).
// Token ngắn có \b 2 phía tránh khớp nhầm trong từ dài (vd "gui" trong "guidance").
// Label không khớp (subject, tên người, nội dung) → "[redacted-label]".
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function resolveBySelectorsFromChain(chain: SelectorChain, root: ParentNode = document): Element | null {
  const found = chain.map((selector) => safeQuery(root, selector)).find((element) => element !== null);
  return found ?? null;
}

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null; // selector không hợp lệ trên bản build đó — coi như miss
  }
}

function spikeAncestorChain(el: Element, levels: number): string {
  const chain: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node !== null && depth < levels) {
    const role = node.getAttribute("role");
    const aria = node.getAttribute("aria-label");
    const textLen = (node.textContent ?? "").length;
    const ariaOut = aria !== null && aria.length > 0 ? normalizeLabel(aria).slice(0, 30) : "[redacted]";
    chain.push(`${node.tagName.toLowerCase()}${role !== null ? `[${role}]` : ""}(aria:${ariaOut},len:${textLen})`);
    node = node.parentElement;
    depth += 1;
  }
  return chain.length > 0 ? chain.join(" ← ") : "(null)";
}

export function spikeSection(): string {
  const lines: string[] = [];
  // 1. iframe inventory — thân email OWA mới có thể nằm trong iframe cùng origin
  const frames = Array.from(document.querySelectorAll("iframe"));
  lines.push(`--- SPIKE: IFRAMES (${frames.length}) ---`);
  frames.slice(0, 10).forEach((frame, index) => {
    let sameOrigin = false;
    let textLen = 0;
    let hasHeading = false;
    try {
      const doc = frame.contentDocument;
      sameOrigin = doc !== null;
      textLen = (doc?.body?.innerText ?? "").length;
      hasHeading = doc !== null && doc.querySelectorAll('[role="heading"], h1, h2').length > 0;
    } catch {
      sameOrigin = false; // cross-origin
    }
    const src = (frame.getAttribute("src") ?? "(inline)").slice(0, 60);
    lines.push(`iframe #${index}: sameOrigin=${sameOrigin} textLen=${textLen} headings=${hasHeading} src=${src}`);
  });
  // 2. block text lớn nhất (body email nghi ngờ) — element CÓ innerText > 300 nhỏ nhất (leaf-ish)
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TEMPLATE"]);
  let best: { el: HTMLElement; len: number } | null = null;
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const htmlEl = el as HTMLElement;
    if (skip.has(el.tagName)) continue;
    if (el.closest("#aimh-panel-host") !== null) continue; // UI extension — loại
    const len = (htmlEl.innerText ?? "").length;
    if (len > 300 && (best === null || len < best.len)) best = { el: htmlEl, len: len };
  }
  if (best !== null) {
    const anchor = best.el.innerText.slice(0, 40).replace(/\s+/g, " ");
    lines.push(`--- SPIKE: BODY-BLOCK (len=${best.len}) anchor="${anchor}..." ---`);
    lines.push(`ancestors: ${spikeAncestorChain(best.el, 10)}`);
  } else {
    lines.push("--- SPIKE: BODY-BLOCK — không tìm thấy block >300 ký tự ---");
  }
  // 3. reading-pane T1 hit — element nào bị trúng sai
  const hit = resolveBySelectorsFromChain(SELECTOR_CHAINS["reading-pane"]);
  if (hit !== null) {
    const htmlHit = hit as HTMLElement;
    const len = (hit.textContent ?? "").length;
    const anchor = (htmlHit.innerText ?? "").slice(0, 40).replace(/\s+/g, " ");
    lines.push(`--- SPIKE: READING-PANE HIT --- len=${len} anchor="${anchor}..."`);
    lines.push(`ancestors: ${spikeAncestorChain(hit, 6)}`);
  }
  // 4. headings (vị trí subject) — chỉ role + độ dài
  const headings = Array.from(document.querySelectorAll('[role="heading"], h1, h2')).slice(0, 8);
  lines.push(`--- SPIKE: HEADINGS (${headings.length}) ---`);
  headings.forEach((h, index) => {
    const len = (h.textContent ?? "").length;
    lines.push(`heading #${index}: len=${len} ancestors=${spikeAncestorChain(h, 4)}`);
  });
  return lines.join("\n");
}
