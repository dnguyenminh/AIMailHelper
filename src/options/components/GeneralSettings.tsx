// src/options/components/GeneralSettings.tsx — uiLanguage + keyStorage + privacy note (GĐ2; FR-GD2-09/BR-04/SR-04).
// keyStorage radio enabled: chuyển khu qua KEY_STORAGE_SET — SW ghi khu mới + XÓA bản cũ (BR-04).
// SR-04: privacy note ĐẦY ĐỦ nêu rõ key sync qua Google/Chrome Sync, hiển thị NGAY CẠNH option sync.
import { t, setUiLanguage } from "../../shared/i18n";
import { useUiLanguage } from "../../shared/i18n/react";
import { useState } from "react";
import type { ConfigData } from "../useConfigData";
import type { KeyStorage } from "../../shared/types";

export function GeneralSettings(props: { config: ConfigData }): JSX.Element {
  const lang = useUiLanguage();
  const keyStorage = props.config.data?.general.keyStorage ?? "sync";
  const [status, setStatus] = useState<"idle" | "changed" | "failed">("idle");

  const changeKeyStorage = async (next: KeyStorage): Promise<void> => {
    if (next === keyStorage) return;
    try {
      await props.config.setKeyStorage(next); // BR-04 — xóa bản cũ phía SW
      setStatus("changed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="general-settings">
      <label className="field">
        <span>{t("options.general.language")}</span>
        <select value={lang} onChange={(event) => void changeLanguage(event.target.value)}>
          <option value="vi">{t("options.general.language.vi")}</option>
          <option value="en">{t("options.general.language.en")}</option>
        </select>
      </label>
      <fieldset className="field">
        <legend>{t("options.general.keyStorage")}</legend>
        <label className="field row">
          <input
            type="radio" name="aimh-key-storage" checked={keyStorage === "sync"}
            onChange={() => void changeKeyStorage("sync")}
          />
          <span>{t("options.general.keyStorage.sync")}</span>
        </label>
        <small className="hint">{t("options.general.keyStorageSyncNote")}</small> {/* SR-04 disclosure */}
        <label className="field row">
          <input
            type="radio" name="aimh-key-storage" checked={keyStorage === "local"}
            onChange={() => void changeKeyStorage("local")}
          />
          <span>{t("options.general.keyStorage.local")}</span>
        </label>
        <small className="hint">{t("options.general.keyStorageLocalNote")}</small>
      </fieldset>
      {status === "changed" && <p className="note ok">{t("options.general.keyStorageChanged")}</p>}
      {status === "failed" && <p className="warning">{t("options.general.keyStorageFailed")}</p>}
      <p className="note">{t("options.general.privacyNote")}</p>
    </div>
  );
}

// BR-15: setUiLanguage validate enum qua storage — giá trị sai bị từ chối, không âm thầm sửa.
async function changeLanguage(value: string): Promise<void> {
  const next = value === "en" ? "en" : "vi";
  try {
    await setUiLanguage(next);
  } catch (error) {
    console.warn("[AIMH][options] change language failed", error);
  }
}
