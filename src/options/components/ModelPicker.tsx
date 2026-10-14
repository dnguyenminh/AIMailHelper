// src/options/components/ModelPicker.tsx — dropdown fetch + nhập tay (GĐ1 stub → GĐ2; BR-17).
import { t } from "../../shared/i18n";

export function ModelPicker() {
  return (
    <div className="form-stub">
      <select disabled aria-label={t("options.section.model")}>
        <option>—</option>
      </select>
      <label className="field">
        <span>{t("options.provider.model")}</span>
        <input type="text" disabled />
      </label>
      <p className="note">{t("options.comingSoon", { phase: "GĐ2" })}</p>
    </div>
  );
}
