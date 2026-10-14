// src/popup/PopupApp.tsx — Màn 1 Popup: provider active + bật/tắt extension + mở Options (FSD §3.4; FR-GD1-02).
// Chỉ nói chuyện với SW qua RPC (GET_RUNTIME_STATE/CONFIG_GET/CONFIG_SET) — không fetch trực tiếp (§2.1).
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { t } from "../shared/i18n";
import { useUiLanguage } from "../shared/i18n/react";
import { sendMessage } from "../shared/messaging";
import type { GeneralConfig, RuntimeState } from "../shared/types";

export function PopupApp() {
  useUiLanguage(); // re-render khi đổi ngôn ngữ (UC-08)
  const [state, setState] = useState<RuntimeState | null>(null);
  const [general, setGeneral] = useState<GeneralConfig | null>(null);

  useEffect(() => {
    void loadState(setState, setGeneral);
  }, []);

  return (
    <main className="popup">
      <h1 className="popup-title">{t("popup.title")}</h1>
      <p className="popup-provider">
        {state ? t("popup.provider.label", { provider: state.providerActive }) : t("popup.loading")}
      </p>
      <label className="popup-toggle">
        <input
          type="checkbox"
          checked={general?.extensionEnabled ?? false}
          disabled={!general}
          onChange={(event) => void toggleExtension(event.target.checked, general, setGeneral, setState)}
        />
        <span>{t("popup.toggle.extension")}</span>
      </label>
      <button type="button" className="popup-options" onClick={() => void chrome.runtime.openOptionsPage()}>
        {t("popup.options.open")}
      </button>
    </main>
  );
}

async function loadState(
  setState: Dispatch<SetStateAction<RuntimeState | null>>,
  setGeneral: Dispatch<SetStateAction<GeneralConfig | null>>
): Promise<void> {
  try {
    const runtimeState = await sendMessage<RuntimeState>("GET_RUNTIME_STATE");
    const config = await sendMessage<{ general: GeneralConfig }>("CONFIG_GET");
    setState(runtimeState);
    setGeneral(config.general);
  } catch (error) {
    console.warn("[AIMH][popup] load state failed", error); // KHÔNG log payload chứa key (BR-08)
  }
}

// §6.1 #2: CONFIG_SET general = object đầy đủ đã validate ở storage (BR-15).
async function toggleExtension(
  next: boolean,
  general: GeneralConfig | null,
  setGeneral: Dispatch<SetStateAction<GeneralConfig | null>>,
  setState: Dispatch<SetStateAction<RuntimeState | null>>
): Promise<void> {
  if (!general) return;
  const updated = { ...general, extensionEnabled: next };
  try {
    await sendMessage("CONFIG_SET", { section: "general", value: updated });
    setGeneral(updated);
    setState((previous) => (previous ? { ...previous, extensionEnabled: next } : previous));
  } catch (error) {
    console.warn("[AIMH][popup] toggle failed", error); // giữ giá trị cũ (EF-5 UC-05)
  }
}
