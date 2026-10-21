// src/shared/copilot-format.ts — tái tạo CẤU TRÚC chatbox Copilot từ DOMSnapshot (21/10).
// UAT: join-space làm heading/bullet tan mất ⇒ sai ngữ nghĩa khi copy. AX tree của panel
// KHÔNG expose role cho markdown Copilot (chỉ generic/staticText) → dùng LAYOUT BOUNDS:
// cùng dòng (Δy nhỏ) nối space; dòng mới [\n]; nhảy block (heading/đoạn cách) [\n\n].
// PURE — KHÔNG chạm chrome.* (dùng chung SW + content; SR-10: chỉ đọc, không mutate DOM).

export interface RawDoc {
  nodes?: { nodeName?: number[]; nodeValue?: number[]; parentIndex?: number[] };
  layout?: { nodeIndex?: number[]; bounds?: number[] };
}

export interface RawSnapshot {
  strings?: string[];
  documents?: RawDoc[];
}

const LINE_DELTA = 10; // Δy ≤ 10 → cùng dòng visual (nối space)
const BLOCK_DELTA = 34; // Δy > 34 → ngắt block \n\n (heading/đoạn cách); giữa → \n

// ancestor script/style → junk (UAT 21/10: 99% RAW là script/style — sạch chỉ ~2.2k/186k).
export function junkAncestor(strings: string[], nodeName: number[], parentIndex: number[], start: number): boolean {
  let parent = parentIndex[start];
  for (let depth = 0; parent !== undefined && parent >= 0 && depth < 10; depth += 1) {
    if (/^(script|style)$/i.test(strings[nodeName[parent] ?? -1] ?? "")) return true;
    parent = parentIndex[parent];
  }
  return false;
}

// Chromium DOM trả bounds NESTED (bounds[k]=[x,y,w,h], Edge 155 — uat12) — chấp nhận cả flat.
export function boundsAt(bounds: unknown, k: number): { x?: number; y?: number; w?: number; h?: number } {
  const list = bounds as unknown[] | undefined;
  const entry = list?.[k];
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  if (Array.isArray(entry)) return { x: num(entry[0]), y: num(entry[1]), w: num(entry[2]), h: num(entry[3]) };
  if (typeof entry === "number") {
    return { x: num(list?.[4 * k]), y: num(list?.[4 * k + 1]), w: num(list?.[4 * k + 2]), h: num(list?.[4 * k + 3]) };
  }
  return {};
}

// 1 document → chuỗi có ngắt dòng theo y của từng text node (document order, CSS px).
// prefix: " " cùng dòng / "\n" dòng mới / "\n\n" nhảy block; thiếu layout → nối space.
function structureFromDoc(doc: RawDoc, strings: string[]): string {
  const nodes = doc?.nodes ?? {}, layout = doc?.layout ?? {};
  const nodeName = nodes.nodeName ?? [], nodeValue = nodes.nodeValue ?? [], parentIndex = nodes.parentIndex ?? [];
  const layoutNode = layout.nodeIndex ?? [], bounds = layout.bounds ?? [];
  const yByNode = new Map<number, number>();
  for (let k = 0; k < layoutNode.length; k += 1) {
    const y = boundsAt(bounds, k).y;
    const nodeIdx = layoutNode[k];
    if (nodeIdx !== undefined && y !== undefined) yByNode.set(nodeIdx, y);
  }
  const tokens: string[] = [];
  let prevY: number | undefined = undefined;
  for (let i = 0; i < nodeName.length; i += 1) {
    if ((strings[nodeName[i] ?? -1] ?? "") !== "#text") continue;
    const valueIndex = nodeValue[i];
    if (valueIndex === undefined || valueIndex === -1) continue;
    const text = strings[valueIndex];
    if (typeof text !== "string" || text.trim().length === 0) continue;
    if (parentIndex.length > 0 && junkAncestor(strings, nodeName, parentIndex, i)) continue;
    const y = yByNode.get(i);
    if (prevY === undefined || y === undefined) tokens.push(" " + text.trim());
    else if (y - prevY > BLOCK_DELTA) tokens.push("\n\n" + text.trim());
    else if (y - prevY > LINE_DELTA) tokens.push("\n" + text.trim());
    else tokens.push(" " + text.trim());
    if (y !== undefined) prevY = y;
  }
  return tokens.join("");
}

// Toàn snapshot (đa document/frame) → text cấu trúc; gộp space + tối đa 2 \n liền.
export function structureFromSnapshot(snapshot: RawSnapshot): string {
  const strings = snapshot?.strings ?? [];
  let out = "";
  for (const doc of snapshot?.documents ?? []) out += structureFromDoc(doc, strings);
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Trao đổi MỚI NHẤT: cắt từ lượt "You said" / "Bạn đã nói" (en/vi) XUẤT HIỆN CUỐI cùng —
// giữ cả prompt echo + câu trả lời của lượt kích hoạt tự động (lượt cũ là lịch sử chat).
export function filterNewExchange(axText: string): string {
  let cut = -1;
  for (const match of axText.matchAll(/you said|bạn đã nói/gi)) cut = match.index;
  return cut < 0 ? axText : axText.slice(cut).trim();
}

// ── Cây node THUẦN từ outerHTML Copilot (uat60 21/10: fai-UserMessage/fai-CopilotMessage
// chứa h1-h6/p/ul/li/strong/a/table thật). Sanitize ở owa-adapter → Panel render bằng
// React element — SR-10: tuyệt đối không tiêm HTML thô (createElement/textContent duy nhất).
export type MdTag =
  | "h" | "p" | "ul" | "ol" | "li" | "pre" | "code" | "blockquote"
  | "a" | "strong" | "em" | "br" | "table" | "tr" | "td" | "text";
export interface MdNode {
  tag: MdTag;
  text?: string; // tag "text" — nội dung chữ (đã trim, cap 8000)
  href?: string; // tag "a" — CHỈ http(s) qua sanitize
  level?: number; // tag "h" — 1..6
  children?: MdNode[]; // ul/ol → li; tr → td; p/h/li/strong/em/a → inline
}
