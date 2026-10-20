// src/background/preview-probe.ts — UC-09 mở rộng (UAT 20/10): probe cấu trúc iframe preview
// qua CDP (getTargets + DOMSnapshot — CHỈ ĐỌC, SR-12). Mục đích: nắm chính xác frame nào chứa
// <img> trang Word, id dạng gì (#i1/#i2…), src dạng gì (data:/http/blob) để đọc attachment đúng.
// Privacy M-2: url/src REDACT (bỏ query + token; data: chỉ báo độ dài) — không nội dung email lọt.
import { getTargets, imagesFromSnapshot, sendSnapshot } from "./preview-reader";

export interface IFrameProbe {
  url: string; // đã redact (origin +/…/+ path cuối, query/hgg bị strip)
  attached: boolean;
  imgCount: number;
  ids: string[]; // tối đa 12 — id thẻ img (vd i1, i2…)
  samples: string[]; // tối đa 3 — src đã redact
  error?: string;
}

// Redact an toàn: data: → "mime;base64,<n> chars"; http → origin + path cuối (query # strip).
export function redactSrc(src: string): string {
  const dataMatch = src.match(/^(data:[^;,]+)/);
  if (dataMatch !== null) return (dataMatch[1] ?? "data:") + ";base64,<" + String(src.length) + " chars>";
  const noQuery = (src.split("?")[0] ?? src).split("#")[0] ?? "";
  const parts = noQuery.split("/");
  const origin = parts.length >= 3 ? parts[0] + "//" + (parts[2] ?? "") : "";
  const last = parts[parts.length - 1] ?? "";
  return (origin + "/…/" + last).slice(0, 80);
}

// Quét TẤT CẢ iframe target (OOPIF — frame preview có thể about:blank): đếm img + id + src redact.
export async function probePreviewIframes(): Promise<IFrameProbe[]> {
  const targets = await getTargets();
  const frames = targets.filter((t) => (t.type as string) === "iframe" && typeof t.id === "string");
  const probes: IFrameProbe[] = [];
  for (const frame of frames.slice(0, 6)) {
    const probe: IFrameProbe = {
      url: redactSrc(frame.url ?? ""),
      attached: frame.attached === true,
      imgCount: 0,
      ids: [],
      samples: []
    };
    try {
      try { await chrome.debugger.attach({ targetId: frame.id }, "1.3"); probe.attached = true; } catch { /* đã attach — session của chính extension vẫn dùng được */ }
      const snapshot = await sendSnapshot(frame.id);
      try { await chrome.debugger.detach({ targetId: frame.id }); } catch { /* ignore */ }
      const images = imagesFromSnapshot(snapshot);
      probe.imgCount = images.length;
      const withId = images.map((img) => img.id).filter((id) => id.length > 0);
      probe.ids = Array.from(new Set(withId)).slice(0, 12);
      probe.samples = Array.from(new Set(images.map((img) => redactSrc(img.src)))).slice(0, 3);
    } catch (error) {
      probe.error = String(error).slice(0, 80);
    }
    probes.push(probe);
  }
  return probes;
}
