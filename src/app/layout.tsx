import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import "./pwa.css";
import { ConfigError } from "@/components/config-error";
import { InstallPrompt } from "@/components/install-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { getRequestPreferences, getViewer } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/env";
import type { Language, Theme } from "@/lib/types";
import { getTranslator } from "@/i18n";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#161613" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const { language } = await getRequestPreferences();
  const t = getTranslator(language);
  return {
    title: {
      default: `${t("app.name")} · ${t("app.tagline")}`,
      template: `%s · ${t("app.name")}`,
    },
    description: t("meta.description"),
    applicationName: t("app.name"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        {
          url: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          url: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: "/icons/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
      shortcut: ["/icons/icon-192.png"],
    },
    appleWebApp: {
      capable: true,
      title: t("app.name"),
      statusBarStyle: "black-translucent",
    },
    formatDetection: { telephone: false },
    other: {
      "mobile-web-app-capable": "yes",
    },
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

  const t = getTranslator(language);

  return (
    <html
      lang={language}
      data-theme={theme}
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        {isDatabaseConfigured() ? (
          children
        ) : (
          <ConfigError language={language} />
        )}
        <PwaRegister />
        <InstallPrompt
          labels={{
            title: t("pwa.installTitle"),
            body: t("pwa.installBody"),
            iosBody: t("pwa.installIosBody"),
            iosOther: t("pwa.installIosOther"),
            button: t("pwa.installButton"),
            dismiss: t("pwa.installNotNow"),
            aria: t("pwa.installLabel"),
          }}
        />
      </body>
    </html>
  );
}
