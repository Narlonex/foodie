import Link from "next/link";
import type { ReactNode } from "react";
import type { Translator } from "@/i18n";
import { Icon } from "./icons";

export function SettingsDetail({
  title,
  intro,
  t,
  children,
  actions,
}: {
  title: string;
  intro?: string;
  t: Translator;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="settings-panel">
      <div className="stack" style={{ gap: 18 }}>
        <Link href="/settings" className="button-link">
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Icon name="arrow-left" size={15} />
            {t("settings.backToSettings")}
          </span>
        </Link>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <p className="eyebrow">{t("settings.title")}</p>
            <h1>{title}</h1>
            {intro ? <p className="page-subtitle">{intro}</p> : null}
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
