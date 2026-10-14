// src/options/components/TestConnection.tsx — nút kiểm tra kết nối (GĐ1 stub → GĐ2; FR-GD2-06).
// GĐ2: hiển thị {ok, message, latencyMs}; disable khi đang gọi; chặn thiếu trường (ERR-11).
import { t } from "../../shared/i18n";

export function TestConnection() {
  return (
    <div className="form-stub">
      <button type="button" disabled>
        {t("options.provider.testConnection")}
      </button>
      <p className="note">{t("options.comingSoon", { phase: "GĐ2" })}</p>
    </div>
  );
}
