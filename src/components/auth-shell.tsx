import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

export function AuthShell({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const t = getTranslator(language);
  return (
    <main className="auth-page" id="main">
      {children}
      <aside className="auth-visual" aria-label={t("app.tagline")}>
        <h2>{t("auth.visualTitle")}</h2>
        <p>{t("auth.visualText")}</p>
        <div className="auth-features">
          <div className="auth-feature">
            <Icon name="check" size={17} />
            <span>{t("auth.featureDiary")}</span>
          </div>
          <div className="auth-feature">
            <Icon name="check" size={17} />
            <span>{t("auth.featureDayTypes")}</span>
          </div>
          <div className="auth-feature">
            <Icon name="check" size={17} />
            <span>{t("auth.featureSources")}</span>
          </div>
        </div>
        <Link href="/" className="sr-only">
          {t("auth.brandHome")}
        </Link>
      </aside>
    </main>
  );
}
