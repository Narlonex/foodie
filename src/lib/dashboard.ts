import { DASHBOARD_NUTRIENTS, type DashboardNutrient } from "./types";

export const DEFAULT_DASHBOARD_NUTRIENTS: readonly DashboardNutrient[] =
  DASHBOARD_NUTRIENTS;

/**
 * Keeps a stored preference safe to render: unknown keys are dropped, order is
 * canonical and calories are always present. Display preferences never touch
 * stored entries, totals or targets.
 */
export function normaliseDashboardNutrients(
  values: readonly string[] | null | undefined,
): DashboardNutrient[] {
  const provided = (values ?? []).filter(isDashboardNutrient);
  // A missing or entirely unusable preference means "never customised", so the
  // defaults apply instead of an almost-empty dashboard.
  if (provided.length === 0) return [...DASHBOARD_NUTRIENTS];
  const wanted = new Set<string>(provided);
  wanted.add("kcal");
  return DASHBOARD_NUTRIENTS.filter((key) => wanted.has(key));
}

export function isDashboardNutrient(value: unknown): value is DashboardNutrient {
  return (
    typeof value === "string" &&
    (DASHBOARD_NUTRIENTS as readonly string[]).includes(value)
  );
}
