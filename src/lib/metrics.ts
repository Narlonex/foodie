import type { ActivityLevel, Sex } from "./types";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface BodyMetricsValues {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
}

/**
 * Rough Mifflin–St Jeor estimate used only for a labelled suggestion.
 * Returns null until every value needed for the equation is available.
 */
export function estimateMaintenanceCalories(
  values: BodyMetricsValues,
): number | null {
  const { heightCm, weightKg, age, sex, activityLevel } = values;
  if (
    heightCm === null ||
    weightKg === null ||
    age === null ||
    sex === null ||
    activityLevel === null
  ) {
    return null;
  }
  if (
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(age) ||
    heightCm <= 0 ||
    weightKg <= 0 ||
    age <= 0
  ) {
    return null;
  }
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const sexOffset = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  const bmr = base + sexOffset;
  const raw = bmr * ACTIVITY_FACTORS[activityLevel];
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw / 10) * 10;
}

export function bodyMassIndex(
  heightCm: number | null,
  weightKg: number | null,
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const metres = heightCm / 100;
  const value = weightKg / (metres * metres);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}
