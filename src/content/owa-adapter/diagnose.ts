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

// Label chức năng giữ lại trong report — pattern đóng (reply/gửi/soạn/xóa/tìm…).
// Label không khớp (subject, tên người, nội dung) → "[redacted-label]" (M-2).
const FUNCTIONAL_LABEL_PATTERN =
  /reply|tr[ảa] l[ơo]?[ai]|forward|chuy[ểe]n tiếp|compose|so[ạa]n|g[ữu]i|delete|x[óo]a|archive|l[ưu]u|search|t[ìi]m|new|m[ớo]i|open|m[ởo]|close|[đd][óo]ng|settings|c[àa]i [đd][ặe]t|more|th[êe]m|menu|undo|ho[àa]n t[áa]c|flag|c[ờo]/i;

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

// Tạo report text — panel hiển thị trong textarea readonly cho user copy (UC-09 bước 3).
export async function collectDiagnoseReport(deps: DiagnoseDeps = defaultDiagnoseDeps()): Promise<DiagnoseReport> {
  const sections: string[] = [];
  sections.push(header(deps));
  sections.push(viewSection(deps.detect()));
  sections.push(probeSection(deps.probeChains()));
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
  return "--- A11Y SNAPSHOT (chỉ role + label chức năng — node khác [redacted-label]) ---\n" + lines.join("\n");
}

const LABELED_LINE = /^(\s*)([\w-]+)\s+"((?:[^"\\]|\\.)*)"\s+\((ref_\d+)\)$/;

function redactSnapshotLine(line: string): string {
  const match = LABELED_LINE.exec(line);
  if (!match) return line; // dòng không label — chỉ role + refId, an toàn
  const [, indent, role, label, ref] = match as unknown as [string, string, string, string, string];
  if (FUNCTIONAL_LABEL_PATTERN.test(label)) return indent + role + ' "' + label + '" (' + ref + ")";
  return indent + role + ' "[redacted-label]" (' + ref + ")"; // M-2
}

// EF-1 — vượt giới hạn → cắt + ghi chú cuối report.
function truncate(text: string): DiagnoseReport {
  if (text.length <= MAX_REPORT_CHARS) return { text: text, truncated: false };
  const cut = text.slice(0, MAX_REPORT_CHARS) + "\n\n[ĐÃ CẮT BỚT — EF-1: report vượt " + String(MAX_REPORT_CHARS) + " ký tự]";
  return { text: cut, truncated: true };
}
