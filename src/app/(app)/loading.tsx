import { getTranslator } from "@/i18n";
import { getRequestPreferences } from "@/lib/auth";

export default async function AppLoading() {
  const { language } = await getRequestPreferences();
  const t = getTranslator(language);
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="stack-sm">
        <div className="skeleton" style={{ height: 22, width: "35%" }} />
        <div className="skeleton" style={{ height: 14, width: "55%" }} />
      </div>
      <div className="skeleton" style={{ height: 240 }} />
      <div className="macro-grid">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
      <div className="skeleton" style={{ height: 180 }} />
    </div>
  );
}
