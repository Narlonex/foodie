"use client";

import Link from "next/link";
import { getTranslator } from "@/i18n";
import { useClientLanguage } from "@/components/use-client-language";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useClientLanguage("html");
  const t = getTranslator(language);

  return (
    <div className="stack" role="alert">
      <header className="page-header">
        <div>
          <p className="eyebrow">Foodie</p>
          <h1>{t("error.title")}</h1>
          <p className="page-subtitle">{t("error.loadFailed")}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button" onClick={reset}>
            {t("common.retry")}
          </button>
          <Link className="button secondary" href="/">
            {t("error.backHome")}
          </Link>
        </div>
      </header>
      <div className="card card-pad">
        <p className="muted">{t("error.server")}</p>
        {error.digest ? (
          <p className="source-note" style={{ marginTop: 10 }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
