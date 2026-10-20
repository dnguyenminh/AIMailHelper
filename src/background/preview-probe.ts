// src/background/preview-probe.ts — UC-09 mở rộng (UAT 20/10): probe cấu trúc iframe preview
// qua CDP (CHỈ ĐỌC, SR-12). Mục đích: nắm chính xác frame nào chứa <img> trang Word, id dạng gì
// (#i1/#i2…), src dạng gì (data:/http/blob) để đọc attachment đúng. Privacy M-2: mọi url/src
// REDACT ở SW (frame-discovery.redactSrc) — không token nội dung email lọt vào báo cáo.
import { imagesFromSnapshot } from "./preview-reader";
import { discoverFrames, redactSrc, sendSnapshot, sendSnapshotTab } from "./frame-discovery";

export { redactSrc } from "./frame-discovery";

export interface IFrameProbe {
  url: string;
  attached: boolean;
  imgCount: number;
  ids: string[]; // tối đa 12 — id thẻ img (vd i1, i2…)
  samples: string[]; // tối đa 3 — src đã redact
  main?: boolean; // true = probe TRANG CHÍNH OWA
  via?: string; // target | event | tree — nguồn phát hiện frame
  tree?: string[]; // dòng insight (target dump / frame tree / event) — redact sẵn
  error?: string;
}

// Dựng probe từ snapshot: đếm img + id + src redact.
function snapshotProbe(url: string, attached: boolean, snapshot: unknown, main: boolean): IFrameProbe {
  const images = imagesFromSnapshot(snapshot);
  return {
    url: url,
    attached: attached,
    imgCount: images.length,
    ids: Array.from(new Set(images.map((img) => img.id).filter((id) => id.length > 0))).slice(0, 12),
    samples: Array.from(new Set(images.map((img) => redactSrc(img.src)))).slice(0, 3),
    main: main === true || undefined
  };
}

export async function probePreviewIframes(tabId: number, tabUrl: string | undefined): Promise<IFrameProbe[]> {
  const discovery = await discoverFrames(tabId, tabUrl); // đã attach trang cha bên trong (đk bắt buộc)
  const probes: IFrameProbe[] = [];
  const main = snapshotProbe("[TRANG CHÍNH — tab OWA]", true, await sendSnapshotTab(tabId), true);
  main.tree = discovery.lines.slice(0, 12); // target dump + frame tree + event — insight 1 hơi
  probes.push(main);
  for (const frame of discovery.frames.filter((f) => f.targetId !== undefined).slice(0, 6)) {
    const targetId = frame.targetId;
    if (targetId === undefined) continue;
    const probe: IFrameProbe = { url: redactSrc(frame.url), attached: frame.attached, imgCount: 0, ids: [], samples: [], via: frame.via };
    try {
      try { await chrome.debugger.attach({ targetId: targetId }, "1.3"); probe.attached = true; } catch { /* session này do chính extension attach — vẫn dùng được */ }
      const snapshot = await sendSnapshot(targetId);
      try { await chrome.debugger.detach({ targetId: targetId }); } catch { /* ignore */ }
      const images = imagesFromSnapshot(snapshot);
      probe.imgCount = images.length;
      probe.ids = Array.from(new Set(images.map((img) => img.id).filter((id) => id.length > 0))).slice(0, 12);
      probe.samples = Array.from(new Set(images.map((img) => redactSrc(img.src)))).slice(0, 3);
    } catch (error) {
      probe.error = String(error).slice(0, 80);
    }
    probes.push(probe);
  }
  for (const frame of discovery.frames.filter((f) => f.targetId === undefined).slice(0, 4)) {
    probes.push({ url: redactSrc(frame.url), attached: false, imgCount: 0, ids: [], samples: [], via: "tree", tree: ["chỉ qua frame-tree — không attach trực tiếp (cùng-process? Edge ẩn target?)"] });
  }
  return probes;
}
