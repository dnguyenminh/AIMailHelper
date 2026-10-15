// src/content/owa-adapter/diagnose.ts — UC-09 (FR-GD4-06; EF-1/EF-2/EF-3; M-2; TDD §3.7).
// Báo cáo cấu trúc DOM/a11y người dùng copy/tải gửi kèm bug report (xuất THỦ CÔNG — §7.3).
// M-2: label CHỈ giữ cho control chức năng (whitelist pattern); label khác → "[redacted-label]";
// body/subject/sender KHÔNG bao giờ vào report (a11y snapshot không chứa text email — SR-02).
// EF-1: vượt MAX_REPORT_CHARS → cắt + ghi chú; EF-3: cảnh báo privacy trước khi gửi.
import { computeLayoutHash } from "./layout-hash";
import { SEND_BUTTON_SELECTORS } from "./selectors";
import type { FunctionKey, SelectorChain } from "./selectors";
import { SELECTOR_CHAINS } from "./selectors";
import { createA11yIndex } from "./a11y-tree";
import { detectView } from "./detector";

export const MAX_REPORT_CHARS = 20_000; // EF-1 UC-09 — snapshot quá lớn → cắt + ghi chú

export interface DiagnoseDeps {
  detect: () => { view: string; container: Element | null };
  snapshot: () => string; // a11y snapshot (role + label chức năng + refId — SR-02)
  layoutHash: () => Promise<string>;
  probeChains: () => ProbeResult[];
  sendPresence: () => boolean; // đối chiếu UC-09 — KHÔNG có đường kích hoạt nào từ extension
  userAgent: () => string;
}

export interface ProbeResult {
  functionKey: FunctionKey;
  selector: string | null; // selector đầu tiên trúng; null → cả chain miss
  chain: string;
}

export interface DiagnoseReport {
  text: string;
  truncated: boolean;
}

// Label chức năng giữ lại trong report — pattern ĐÓNG so khớp trên dạng ĐÃ BỎ DẤU (NFD strip +
// đ→d + lowercase — "Trả lời" → "tra loi"; ký tự Việt precomposed không match được bằng class).
// Token ngắn có \b 2 phía tránh khớp nhầm trong từ dài (vd "gui" trong "guidance").
// Label không khớp (subject, tên người, nội dung) → "[redacted-label]" (M-2).
const FUNCTIONAL_LABEL_PATTERN =
  /reply|tra loi|forward|chuyen tiep|compose|soan|\bgui\b|delete|xoa|archive|luu|search|\btim\b|new|\bmoi\b|open|\bmo\b|close|\bdong\b|settings|cai dat|more|them|menu|undo|hoan tac|flag|\bco\b/i;

// Bỏ dấu tiếng Việt: NFD → strip combining marks (U+0300..036F) → đ/Đ → d/D → lowercase.
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function defaultDiagnoseDeps(): DiagnoseDeps {
  const index = createA11yIndex();
  return {
    detect: () => detectView(),
    snapshot: () => index.buildSnapshot().text,
    layoutHash: () => computeLayoutHash(),
    probeChains: () => probeAllChains(),
    sendPresence: () => resolveBySelectorsFromChain(SEND_BUTTON_SELECTORS) !== null,
    userAgent: () => navigator.userAgent
  };
}

// UC-02/09 — quét từng selector trong chain T1, ghi selector trúng đầu tiên (hoặc null).
export function probeAllChains(root: ParentNode = document): ProbeResult[] {
  return (Object.keys(SELECTOR_CHAINS) as FunctionKey[]).map((functionKey) => {
    const chain = SELECTOR_CHAINS[functionKey];
    const selector = chain.find((candidate) => safeQuery(root, candidate) !== null) ?? null;
    return { functionKey: functionKey, selector: selector, chain: chain.join(" | ") };
  });
}

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null; // selector không hợp lệ trên bản build đó — coi như miss
  }
}

function resolveBySelectorsFromChain(chain: SelectorChain, root: ParentNode = document): Element | null {
  const found = chain.map((selector) => safeQuery(root, selector)).find((element) => element !== null);
  return found ?? null;
}

// UAT SPIKE (15/10) — dữ liệu cấu trúc OWA mới (outlook.cloud.microsoft) để fix reader/selectors.
// CHỈ cấu trúc: tag/role/aria + ĐỘ DÀI text + anchor 40 ký tự đầu (user tự redact khi gửi — EF-3).
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

function spikeSection(): string {
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
  document.querySelectorAll("body *").forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (skip.has(el.tagName)) return;
    if (el.closest("#aimh-panel-host") !== null) return; // UI extension — loại
    const len = (htmlEl.innerText ?? "").length;
    if (len > 300 && (best === null || len < best.len)) best = { el: htmlEl, len: len };
  });
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
    const len = (hit.textContent ?? "").length;
    const anchor = (hit.innerText ?? "").slice(0, 40).replace(/\s+/g, " ");
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

// Tạo report text — panel hiển thị trong textarea readonly cho user copy (UC-09 bước 3).
export async function collectDiagnoseReport(deps: DiagnoseDeps = defaultDiagnoseDeps()): Promise<DiagnoseReport> {
  const sections: string[] = [];
  sections.push(header(deps));
  sections.push(viewSection(deps.detect()));
  sections.push(probeSection(deps.probeChains()));
  sections.push(spikeSection()); // UAT — SPIKE trước snapshot lớn để không bị cắt (EF-1)
  sections.push(snapshotSection(deps.snapshot()));
  const hash = await deps.layoutHash();
  sections.push("LAYOUT HASH: " + hash + " (đổi khi MS đổi cấu trúc — BR-06)");
  sections.push(
    "NÚT GỬI THƯ OWA: " + (deps.sendPresence() ? "thấy (đối chiếu — extension không kích hoạt)" : "không thấy") // UC-09
  );
  sections.push(
    "[EF-3] CẢNH BÁO PRIVACY: report chỉ chứa cấu trúc + label chức năng (M-2); VẪN rà soát trước khi gửi kèm bug report."
  );
  const text = sections.join("\n\n");
  return truncate(text);
}

function header(deps: DiagnoseDeps): string {
  return ["=== AIMAILHELPER DIAGNOSE (UC-09) ===", "Thời điểm: " + new Date().toISOString(), "User agent: " + deps.userAgent()].join("\n");
}

function viewSection(detect: { view: string; container: Element | null }): string {
  const known = detect.view !== "unknown" && detect.container !== null;
  const note = known
    ? "Layout nhận diện: " + detect.view
    : "Layout nhận diện: unknown (EF-2) — kèm hướng dẫn thu thập thêm (cả 3 chế độ xem, 2 domain)";
  return "--- LAYOUT ---\n" + note;
}

function probeSection(probes: ProbeResult[]): string {
  const lines = probes.map((probe) => {
    const hit = probe.selector === null ? "MISS (cả chain)" : "HIT: " + probe.selector;
    return "- " + probe.functionKey + ": " + hit;
  });
  return "--- T1 SELECTOR CHAINS ---\n" + lines.join("\n");
}

// M-2 — label trong snapshot được lọc lần 2: chỉ control chức năng giữ label.
function snapshotSection(snapshot: string): string {
  const lines = snapshot.split("\n").map((line) => redactSnapshotLine(line));
  return "--- A11Y SNAPSHOT (chỉ role + label chức năng; node khác bị ẩn label) ---\n" + lines.join("\n");
}

// Label MANG NỘI DUNG (email trong label / label dài) → redact TRƯỚC khi test functional —
// "a@x.vn gửi lúc 10:00" chứa từ chức năng nhưng vẫn là PII (M-2 — subject/sender không lọt).
const EMAIL_IN_LABEL = /\S+@\S+\.\S+/;
const CONTENT_LABEL_MAX = 80;

function isFunctionalLabel(label: string): boolean {
  if (EMAIL_IN_LABEL.test(label)) return false;
  if (label.length > CONTENT_LABEL_MAX) return false;
  return FUNCTIONAL_LABEL_PATTERN.test(normalizeLabel(label));
}

const LABELED_LINE = /^(\s*)([\w-]+)\s+"((?:[^"\\]|\\.)*)"\s+\((ref_\d+)\)$/;

function redactSnapshotLine(line: string): string {
  const match = LABELED_LINE.exec(line);
  if (!match) return line; // dòng không label — chỉ role + refId, an toàn
  const [, indent, role, label, ref] = match as unknown as [string, string, string, string, string];
  if (isFunctionalLabel(label)) return indent + role + ' "' + label + '" (' + ref + ")";
  return indent + role + ' "[redacted-label]" (' + ref + ")"; // M-2
}

// EF-1 — vượt giới hạn → cắt + ghi chú cuối report.
function truncate(text: string): DiagnoseReport {
  if (text.length <= MAX_REPORT_CHARS) return { text: text, truncated: false };
  const cut = text.slice(0, MAX_REPORT_CHARS) + "\n\n[ĐÃ CẮT BỚT — EF-1: report vượt " + String(MAX_REPORT_CHARS) + " ký tự]";
  return { text: cut, truncated: true };
}
