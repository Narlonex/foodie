import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { Icon, type IconName } from "@/components/icons";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.title");
}

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);

  const rows: { href: string; label: string; icon: IconName }[] = [
    {
      href: "/settings/goals",
      label: t("settings.nutritionGoals"),
      icon: "target",
    },
    {
      href: "/settings/metrics",
      label: t("settings.metrics"),
      icon: "scale",
    },
    {
      href: "/settings/dashboard",
      label: t("settings.dashboard"),
      icon: "chart",
    },
    {
      href: "/settings/day-types",
      label: t("settings.dayTypes"),
      icon: "calendar",
    },
    {
      href: "/settings/appearance",
      label: t("settings.appearance"),
      icon: "sun",
    },
    {
      href: "/settings/language",
      label: t("settings.language"),
      icon: "globe",
    },
    {
      href: "/settings/units",
      label: t("settings.units"),
      icon: "scale",
    },
    {
      href: "/settings/food-data",
      label: t("settings.foodData"),
      icon: "database",
    },
    {
      href: "/settings/account",
      label: t("settings.account"),
      icon: "user",
    },
  ];

  return (
    <div className="settings-panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("app.name")}</p>
          <h1>{t("settings.title")}</h1>
        </div>
      </div>
      <nav className="card settings-list" aria-label={t("settings.title")}>
        {rows.map((row) => (
          <Link
            href={row.href}
            className="settings-row"
            key={row.href}
            aria-label={t("settings.open", { section: row.label })}
          >
            <span className="settings-icon">
              <Icon name={row.icon} size={19} />
            </span>
            <strong>{row.label}</strong>
            <span className="chevron">
              <Icon name="chevron-right" size={18} />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
