// src/content/owa-adapter/copilot-sanitize.ts — outerHTML Copilot → cây MdNode THUẦN.
// Biên DOM được phép (owa-adapter — CR-C). SR-10: KHÔNG innerHTML — chỉ DOMParser + đọc cây.
// Allowlist tag/attr (script/svg/img/button/chip gợi ý bị vứt; href CHỈ http(s)); text cap 8000.
import { sendMessage } from "../../shared/messaging";
import type { MdNode } from "../../shared/copilot-format";

const MAX_TEXT = 8000;

function textNode(raw: string): MdNode | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  return { tag: "text", text: text.slice(0, MAX_TEXT) };
}

function safeHref(el: Element): string | undefined {
  const href = el.getAttribute("href") ?? undefined;
  if (href === undefined || !/^https?:\/\//i.test(href)) return undefined; // javascript:/relative → bỏ
  return href.slice(0, 1000);
}

// Đi cây DOM → node; tag lạ (div/span/section…) = TRONG SUỐT: children dồn lên cha.
function mapElement(el: Element): MdNode[] {
  const tag = el.tagName;
  if (tag === "BR") return [{ tag: "br" }];
  if (tag === "A") {
    const children = mapChildren(el);
    const href = safeHref(el);
    if (href === undefined) return children; // link không hợp lệ → bóc vỏ, giữ text
    return [{ tag: "a", href: href, children: children }];
  }
  if (tag === "STRONG" || tag === "B") return [{ tag: "strong", children: mapChildren(el) }];
  if (tag === "EM" || tag === "I") return [{ tag: "em", children: mapChildren(el) }];
  if (tag === "CODE") return [{ tag: "code", children: mapChildren(el) }];
  if (tag === "PRE") return [{ tag: "pre", children: mapChildren(el) }];
  if (tag === "BLOCKQUOTE") return [{ tag: "blockquote", children: mapChildren(el) }];
  if (H_LEVEL[tag] !== undefined) return [{ tag: "h", level: H_LEVEL[tag], children: mapChildren(el) }];
  if (tag === "P") {
    const children = mapChildren(el);
    return children.length === 0 ? [] : [{ tag: "p", children: children }];
  }
  if (tag === "UL" || tag === "OL") {
    const items = Array.from(el.children).filter((c) => c.tagName === "LI").flatMap((li) => mapElement(li));
    return items.length === 0 ? [] : [{ tag: tag === "UL" ? "ul" : "ol", children: items }];
  }
  if (tag === "LI") return [{ tag: "li", children: mapChildren(el) }];
  if (tag === "TABLE") return [{ tag: "table", children: mapChildren(el) }];
  if (tag === "TR") return [{ tag: "tr", children: mapChildren(el) }];
  if (tag === "TD" || tag === "TH") return [{ tag: "td", children: mapChildren(el) }];
  return mapChildren(el); // div/span/… trong suốt
}

const H_LEVEL: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

function mapChildren(el: Element): MdNode[] {
  const out: MdNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = textNode(child.textContent ?? "");
      if (t !== null) out.push(t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    out.push(...mapElement(child as Element));
  }
  return out;
}

// API chính: html string → MdNode[] (rỗng khi không map được gì — caller fallback raw).
export function sanitizeCopilotHtml(html: string): MdNode[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }
  doc.querySelectorAll("script,style,svg,img,button,[aria-hidden='true'],[data-testid='chat-suggestion']").forEach((el) => el.remove());
  const nodes = Array.from(doc.body.children).flatMap((el) => mapElement(el));
  return nodes.filter((n) => n.tag !== "text" || (n.text !== undefined && n.text.length > 0)).slice(0, 400);
}

// RPC COPIL_PANEL_HTML → sanitize; lỗi/HTML rỗng → undefined (caller giữ đường cũ).
export async function copilotMdTree(): Promise<MdNode[] | undefined> {
  try {
    const read = await sendMessage<{ html?: string; error?: string }>("COPIL_PANEL_HTML", {});
    if (typeof read.html !== "string" || read.html.trim().length === 0) return undefined;
    const tree = sanitizeCopilotHtml(read.html);
    return tree.length > 0 ? tree : undefined;
  } catch {
    return undefined;
  }
}
