import { getTranslator, type Language } from "@/i18n";
import { Icon } from "./icons";

export function ConfigError({ language }: { language: Language }) {
  const t = getTranslator(language);
  return (
    <div className="config-page">
      <main className="card config-card" id="main">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark">
            <Icon name="leaf" size={22} strokeWidth={2} />
          </span>
          <strong>{t("app.name")}</strong>
        </div>
        <div>
          <h1>{t("error.configTitle")}</h1>
          <p className="page-subtitle">{t("error.configIntro")}</p>
        </div>
        <div className="notice warning">
          <Icon name="alert" size={18} />
          <span>{t("error.configHelp")}</span>
        </div>
        <ol className="config-steps">
          <li>{t("error.configStep1")}</li>
          <li>{t("error.configStep2")}</li>
          <li>{t("error.configStep3")}</li>
        </ol>
        <p className="small muted">
          <code>DATABASE_URL</code> · <code>npm run db:migrate</code> ·{" "}
          <code>npm run dev</code>
        </p>
      </main>
    </div>
  );
}
