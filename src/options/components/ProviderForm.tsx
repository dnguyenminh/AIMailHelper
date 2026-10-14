// src/options/components/ProviderForm.tsx — form per-provider (GĐ1 stub → GĐ2 điền; FSD §3.4 Màn 2 #1).
// GĐ2: trường hiển thị theo provider; key/baseUrl/model validate BR-15 + SR-06 (validateBaseUrl).
import { t } from "../../shared/i18n";

export function ProviderForm() {
  return (
    <div className="form-stub">
      <label className="field">
        <span>{t("options.provider.apiKey")}</span>
        <input type="password" disabled placeholder="••••••••" />
      </label>
      <label className="field">
        <span>{t("options.provider.baseUrl")}</span>
        <input type="url" disabled />
      </label>
      <label className="field">
        <span>{t("options.provider.model")}</span>
        <input type="text" disabled />
      </label>
      <p className="note">{t("options.comingSoon", { phase: "GĐ2" })}</p>
    </div>
  );
}
