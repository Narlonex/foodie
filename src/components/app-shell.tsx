import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import type { Translator } from "@/i18n";
import type { Viewer } from "@/lib/types";
import { Icon } from "./icons";
import { NavLinks, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({
  viewer,
  t,
  children,
}: {
  viewer: Viewer;
  t: Translator;
  children: ReactNode;
}) {
  const items: NavItem[] = [
    { href: "/", label: t("nav.dashboard"), icon: "dashboard" },
    { href: "/foods", label: t("nav.foodLibrary"), icon: "book" },
    { href: "/history", label: t("nav.history"), icon: "chart" },
    { href: "/settings", label: t("nav.settings"), icon: "settings" },
  ];

  return (
    <>
      <a className="skip-link" href="#main">
        {t("a11y.skip")}
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link
            href="/"
            className="brand"
            aria-label={`${t("app.name")} – ${t("nav.dashboard")}`}
          >
            <span className="brand-mark">
              <Icon name="leaf" size={22} strokeWidth={2} />
            </span>
            <span>
              <span className="brand-text">{t("app.name")}</span>
              <span className="brand-sub">{t("app.tagline")}</span>
            </span>
          </Link>

          <NavLinks
            items={items}
            ariaLabel={t("nav.primary")}
            variant="desktop"
          />

          <div className="header-actions">
            <div className="account-chip">
              <Icon name="user" size={16} />
              <span>{viewer.user.email}</span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="icon-button small ghost"
                  aria-label={t("nav.signOut")}
                  title={t("nav.signOut")}
                >
                  <Icon name="logout" size={16} />
                </button>
              </form>
            </div>
            <ThemeToggle
              theme={viewer.profile.theme}
              language={viewer.profile.language}
            />
          </div>
        </div>
      </header>

      <main id="main" className="app-main">
        {children}
      </main>

      <NavLinks
        items={items}
        ariaLabel={t("nav.primary")}
        variant="mobile"
      />
    </>
  );
}
