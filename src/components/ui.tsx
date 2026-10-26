import type { ReactNode } from "react";
import { getTranslator } from "@/i18n";
import type { FoodSource, Language, Preparation } from "@/lib/types";
import { Icon } from "./icons";

export function ProgressBar({
  value,
  max,
  label,
  colorClass,
  over = false,
}: {
  value: number | null;
  max: number | null;
  label: string;
  colorClass?: string;
  over?: boolean;
}) {
  const percent =
    value !== null && max !== null && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100))
      : 0;
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max ?? undefined}
      aria-valuenow={value ?? undefined}
      aria-valuetext={label}
      aria-label={label}
    >
      <div
        className={`progress-fill ${colorClass ?? ""} ${over ? "over" : ""}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Shown only when the source or the user actually stated a preparation. */
export function PreparationBadge({
  preparation,
  language,
}: {
  preparation: Preparation;
  language: Language;
}) {
  if (preparation === "unspecified") return null;
  const t = getTranslator(language);
  return (
    <span
      className={`badge prep-${preparation}`}
      title={t(
        preparation === "raw" ? "preparation.rawHelp" : "preparation.cookedHelp",
      )}
    >
      {t(preparation === "raw" ? "preparation.raw" : "preparation.cooked")}
    </span>
  );
}

export function SourceBadge({
  source,
  language,
}: {
  source: FoodSource;
  language: Language;
}) {
  const t = getTranslator(language);
  if (source === "custom") {
    return (
      <span className="badge accent" title={t("sources.customNote")}>
        {t("sources.customShort")}
      </span>
    );
  }
  return (
    <span className="badge" title={t(source === "off" ? "sources.off" : "sources.usda")}>
      {source === "off" ? t("sources.offShort") : t("sources.usdaShort")}
    </span>
  );
}

export function MealIcon({ meal }: { meal: string }) {
  const name =
    meal === "breakfast"
      ? "coffee"
      : meal === "lunch"
        ? "bowl"
        : meal === "dinner"
          ? "utensils"
          : "cookie";
  return (
    <span className="meal-icon">
      <Icon name={name} size={19} />
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
