// src/background/preview-probe.ts — UC-09 mở rộng (UAT 20/10): probe cấu trúc iframe preview
// qua CDP (getTargets + DOMSnapshot — CHỈ ĐỌC, SR-12). Mục đích: nắm chính xác frame nào chứa
// <img> trang Word, id dạng gì (#i1/#i2…), src dạng gì (data:/http/blob) để đọc attachment đúng.
// Privacy M-2: url/src REDACT (bỏ query + token; data: chỉ báo độ dài) — không nội dung email lọt.
// BÀI HỌC 20/10 — getTargets() chỉ liệt kê iframe OOPIF SAU khi trang cha đã attach
// (UC-09 текст đọc được frame do ensureAttachedShared; probe lần 1 không attach → 0 frame).
import { getTargets, imagesFromSnapshot, sendSnapshot } from "./preview-reader";
import { ensureAttachedShared } from "./debugger-scroll";

export interface IFrameProbe {
  url: string; // đã redact (origin +/…/+ path cuối, query/hash bị strip)
  attached: boolean;
  imgCount: number;
  ids: string[]; // tối đa 12 — id thẻ img (vd i1, i2…)
  samples: string[]; // tối đa 3 — src đã redact
  main?: boolean; // true = probe TRANG CHÍNH OWA (không phải iframe)
  error?: string;
}

// Redact an toàn: data: → "mime;base64,<n> chars"; blob: → chỉ báo độ dài (uuid là token nữa);
// about: giữ nguyên; absolute http → origin + path cuối (query # strip); path tương đối giữ nguyên.
export function redactSrc(src: string): string {
  if (src.startsWith("blob:")) return "blob:<" + String(src.length) + " chars>";
  const dataMatch = src.match(/^(data:[^;,]+)/);
  if (dataMatch !== null) return (dataMatch[1] ?? "data:") + ";base64,<" + String(src.length) + " chars>";
  if (src.startsWith("about:")) return src;
  if (!/^https?:/i.test(src)) return (src.split("?")[0] ?? src).split("#")[0] ?? "";
  const parts = ((src.split("?")[0] ?? src).split("#")[0] ?? "").split("/");
  const origin = (parts[0] ?? "") + "//" + (parts[2] ?? "");
  return (origin + "/…/" + (parts[parts.length - 1] ?? "")).slice(0, 80);
}

// Dựng 1 dòng probe từ snapshot: đếm img + id + src (giúp cả iframe lẫn trang chính).
function snapshotProbe(url: string, attached: boolean, snapshot: unknown, main: boolean): IFrameProbe {
  const images = imagesFromSnapshot(snapshot);
  const withId = images.map((img) => img.id).filter((id) => id.length > 0);
  return {
    url: url,
    attached: attached,
    imgCount: images.length,
    ids: Array.from(new Set(withId)).slice(0, 12),
    samples: Array.from(new Set(images.map((img) => redactSrc(img.src)))).slice(0, 3),
    main: main === true || undefined
  };
}

function sendSnapshotTab(tabId: number): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId: tabId }, "DOMSnapshot.captureSnapshot", { computedStyles: [] }, (result) => {
      void chrome.runtime.lastError;
      resolve(result);
    });
  });
}

// Probe iframe preview của 1 tab: (1) attach TRANG CHA TRƯỚC (điều kiện để getTargets liệt kê
// OOPIF), (2) quét iframe target, (3) snapshot cả trang chính để bắt ảnh cùng-process.
export async function probePreviewIframes(tabId: number, tabUrl: string | undefined): Promise<IFrameProbe[]> {
  await ensureAttachedShared(tabId, tabUrl);
  const probes: IFrameProbe[] = [];
  const main = snapshotProbe("[TRANG CHÍNH — tab OWA]", true, await sendSnapshotTab(tabId), true);
  probes.push(main);
  const targets = await getTargets();
  const frames = targets.filter((t) => (t.type as string) === "iframe" && typeof t.id === "string");
  for (const frame of frames.slice(0, 6)) {
    const probe: IFrameProbe = { url: redactSrc(frame.url ?? ""), attached: frame.attached === true, imgCount: 0, ids: [], samples: [] };
    try {
      try { await chrome.debugger.attach({ targetId: frame.id }, "1.3"); probe.attached = true; } catch { /* đã attach — session của chính extension vẫn dùng được */ }
      const snapshot = await sendSnapshot(frame.id);
      try { await chrome.debugger.detach({ targetId: frame.id }); } catch { /* ignore */ }
      const images = imagesFromSnapshot(snapshot);
      probe.imgCount = images.length;
      probe.ids = Array.from(new Set(images.map((img) => img.id).filter((id) => id.length > 0))).slice(0, 12);
      probe.samples = Array.from(new Set(images.map((img) => redactSrc(img.src)))).slice(0, 3);
    } catch (error) {
      probe.error = String(error).slice(0, 80);
    }
    probes.push(probe);
  }
  return probes;
}
