// src/content/components/Panel/PanelWindow.tsx — chrome cửa sổ panel (UAT feedback 15/10):
// kéo thả qua thanh tiêu đề, thu nhỏ (--), ẩn (×) thành bong bóng tròn, khôi phục; vị trí +
// trạng thái persist sessionStorage (theo tab — hợp lý cho cửa sổ gắn tab). Host element nằm
// NGOÀI shadow (position:fixed) — set style trực tiếp qua prop host.
import { useCallback, useEffect, useRef, useState } from "react";
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
  const dragRef = useRef<{ dx: number; dy: number; width: number } | null>(null);

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

  const onTitleDown = useCallback(
    (e: React.MouseEvent): void => {
      if (!host || (e.target as HTMLElement).closest("button")) return; // nút điều khiển — không kéo
      const rect = host.getBoundingClientRect();
      dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, width: rect.width };
      host.style.right = "auto";
      const move = (ev: MouseEvent): void => {
        if (!dragRef.current) return;
        const x = Math.min(Math.max(ev.clientX - dragRef.current.dx, 4), Math.max(window.innerWidth - dragRef.current.width - 4, 4));
        const y = Math.min(Math.max(ev.clientY - dragRef.current.dy, 4), window.innerHeight - 36);
        applyPos(x + "px", y + "px");
      };
      const up = (): void => {
        dragRef.current = null;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
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
      <div className="aimh-titlebar" onMouseDown={onTitleDown} role="heading" aria-level={1}>
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
