import Link from "next/link";
import { getRequestPreferences } from "@/lib/auth";
import { getTranslator } from "@/i18n";

export default async function NotFound() {
  const { language } = await getRequestPreferences();
  const t = getTranslator(language);
  return (
    <main className="config-page" id="main">
      <div className="card config-card">
        <p className="eyebrow">404</p>
        <h1>{t("error.notFound")}</h1>
        <p className="page-subtitle">{t("error.notFoundHelp")}</p>
        <p className="source-note">{t("error.reference")}</p>
        <div>
          <Link href="/" className="button">
            {t("error.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
