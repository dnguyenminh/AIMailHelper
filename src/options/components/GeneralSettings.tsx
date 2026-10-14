// src/options/components/GeneralSettings.tsx — ngôn ngữ UI + nơi lưu key + privacy note (FSD §3.4 #6).
// GĐ1: uiLanguage HOẠT ĐỘNG (UC-08); keyStorage radio DISABLED (GĐ2 — BR-04/SR-04 copy đi kèm).
import { t, setUiLanguage } from "../../shared/i18n";
import { useUiLanguage } from "../../shared/i18n/react";

export function GeneralSettings() {
  const lang = useUiLanguage();
  return (
    <div className="form-stub">
      <label className="field">
        <span>{t("options.general.language")}</span>
        <select value={lang} onChange={(event) => void changeLanguage(event.target.value)}>
          <option value="vi">{t("options.general.language.vi")}</option>
          <option value="en">{t("options.general.language.en")}</option>
        </select>
      </label>
      <fieldset disabled className="field">
        <legend>{t("options.general.keyStorage")}</legend>
        <label className="field row">
          <input type="radio" name="aimh-key-storage" defaultChecked />
          <span>{t("options.general.keyStorage.sync")}</span>
        </label>
        <label className="field row">
          <input type="radio" name="aimh-key-storage" />
          <span>{t("options.general.keyStorage.local")}</span>
        </label>
      </fieldset>
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
