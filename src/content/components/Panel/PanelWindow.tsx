// src/content/components/Panel/PanelWindow.tsx — chrome cửa sổ panel (UAT feedback 15/10):
// kéo thả qua thanh tiêu đề, thu nhỏ (--), ẩn (×) thành bong bóng tròn, khôi phục; vị trí +
// trạng thái persist sessionStorage (theo tab — hợp lý cho cửa sổ gắn tab). Host element nằm
// NGOÀI shadow (position:fixed) — set style trực tiếp qua prop host.
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { t } from "../../../shared/i18n";

const POS_KEY = "panel.window.pos";
const STATE_KEY = "panel.window.state";

type WindowState = "expanded" | "min" | "hidden";

interface SavedWindow {
  left?: string;
  top?: string;
  state?: WindowState;
}

export function PanelWindow({ host, children }: { host: HTMLDivElement | null; children: ReactNode }) {
  const [win, setWin] = useState<WindowState>("expanded");

  // Khôi phục vị trí + trạng thái lưu lúc mount.
  useEffect(() => {
    if (!host) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(POS_KEY) ?? "{}") as SavedWindow;
      if (saved.left && saved.top) {
        host.style.right = "auto";
        host.style.left = saved.left;
        host.style.top = saved.top;
      }
      const st = sessionStorage.getItem(STATE_KEY) as WindowState | null;
      if (st === "min" || st === "hidden") setWin(st);
    } catch {
      /* sessionStorage lỗi — dùng mặc định */
    }
    console.info("[AIMH] panel ready — kéo thanh tiêu đề để di chuyển");
  }, [host]);

  const applyPos = useCallback(
    (left: string, top: string): void => {
      if (!host) return;
      host.style.right = "auto";
      host.style.left = left;
      host.style.top = top;
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify({ left: left, top: top }));
      } catch {
        /* bỏ qua */
      }
    },
    [host]
  );

  // UAT — kéo thả bằng Pointer Events + capture TRÊN CHÍNH thanh tiêu đề (không qua window):
  // mousemove trên window dễ bị trang OWA chặn/hủy; pointer capture giữ chuỗi drag ngay cả khi
  // chuột ra ngoài panel. touch-action:none trong CSS để touch cũng kéo được.
  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (!host || !e.isPrimary || (e.target as HTMLElement).closest("button")) return; // nút — không kéo
      const bar = e.currentTarget as HTMLElement;
      const rect = host.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const width = rect.width;
      host.style.right = "auto";
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        /* capture không hỗ trợ — vẫn kéo bằng pointermove */
      }
      const move = (ev: PointerEvent): void => {
        const x = Math.min(Math.max(ev.clientX - dx, 4), Math.max(window.innerWidth - width - 4, 4));
        const y = Math.min(Math.max(ev.clientY - dy, 4), window.innerHeight - 36);
        applyPos(x + "px", y + "px");
      };
      const up = (): void => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    },
    [applyPos, host]
  );

  const setWinState = useCallback((s: WindowState): void => {
    setWin(s);
    try {
      sessionStorage.setItem(STATE_KEY, s);
    } catch {
      /* bỏ qua */
    }
  }, []);

  if (win === "hidden") {
    return (
      <button type="button" className="aimh-bubble" aria-label="Mở AIMailHelper" onClick={() => setWinState("expanded")}>
        🤖
      </button>
    );
  }

  return (
    <div className="aimh-panel">
      <div className="aimh-titlebar" onPointerDown={onTitlePointerDown} role="heading" aria-level={1}>
        <span className="aimh-panel-title">{t("panel.title")}</span>
        <span className="aimh-winbtns">
          <button
            type="button"
            aria-label={win === "min" ? "Mở rộng" : "Thu nhỏ"}
            onClick={() => setWinState(win === "min" ? "expanded" : "min")}
          >
            —
          </button>
          <button type="button" aria-label="Ẩn panel" onClick={() => setWinState("hidden")}>
            ×
          </button>
        </span>
      </div>
      {win === "min" ? null : <div className="aimh-body">{children}</div>}
    </div>
  );
}
