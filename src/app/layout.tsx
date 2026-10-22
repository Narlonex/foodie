import type { Metadata } from "next";
import "./globals.css";
import { ConfigError } from "@/components/config-error";
import { getRequestPreferences, getViewer } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/env";
import type { Language, Theme } from "@/lib/types";
import { getTranslator } from "@/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { language } = await getRequestPreferences();
  const t = getTranslator(language);
  return {
    title: {
      default: `${t("app.name")} · ${t("app.tagline")}`,
      template: `%s · ${t("app.name")}`,
    },
    description: t("meta.description"),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const preferences = await getRequestPreferences();
  let language: Language = preferences.language;
  let theme: Theme = preferences.theme;

  if (isDatabaseConfigured()) {
    try {
      const viewer = await getViewer();
      if (viewer) {
        language = viewer.profile.language;
        theme = viewer.profile.theme;
      }
    } catch {
      // A configured but unreachable database is handled by the page error
      // boundary; keep the request theme so the shell still renders.
    }
  }

  return (
    <html lang={language} data-theme={theme} suppressHydrationWarning>
      <body>
        {isDatabaseConfigured() ? (
          children
        ) : (
          <ConfigError language={language} />
        )}
      </body>
    </html>
  );
}
