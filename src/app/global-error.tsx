"use client";

import { getTranslator } from "@/i18n";
import { useClientLanguage } from "@/components/use-client-language";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const language = useClientLanguage("cookie");
  const t = getTranslator(language);

  return (
    <html lang={language} data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#080d0b",
          color: "#f2f7f4",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main style={{ maxWidth: 520, display: "grid", gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>{t("error.title")}</h1>
          <p style={{ margin: 0, color: "#9fb3a8" }}>{t("error.generic")}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              justifySelf: "start",
              minHeight: 44,
              padding: "0 18px",
              border: 0,
              borderRadius: 12,
              background: "#31d49a",
              color: "#062018",
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            {t("common.retry")}
          </button>
          {error.digest ? (
            <p style={{ margin: 0, color: "#748a7e", fontSize: "0.8rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
