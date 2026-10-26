import "server-only";
import { queryOne } from "../db";
import type {
  ActivityLevel,
  DashboardNutrient,
  GoalMode,
  Language,
  Sex,
  Theme,
  UnitSystem,
} from "../types";

export async function updateLanguage(
  userId: string,
  language: Language,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET language = $2 WHERE user_id = $1 RETURNING user_id`,
    [userId, language],
  );
  return Boolean(row);
}

export async function updateTheme(
  userId: string,
  theme: Theme,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET theme = $2 WHERE user_id = $1 RETURNING user_id`,
    [userId, theme],
  );
  return Boolean(row);
}

export async function updateUnitSystem(
  userId: string,
  unitSystem: UnitSystem,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET unit_system = $2 WHERE user_id = $1 RETURNING user_id`,
    [userId, unitSystem],
  );
  return Boolean(row);
}

export async function updateGoals(
  userId: string,
  goalMode: GoalMode,
  maintenanceCalories: number | null,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET goal_mode = $2, maintenance_calories = $3
      WHERE user_id = $1 RETURNING user_id`,
    [userId, goalMode, maintenanceCalories],
  );
  return Boolean(row);
}

export async function updateUsdaPreference(
  userId: string,
  usdaEnabled: boolean,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET usda_enabled = $2
      WHERE user_id = $1 RETURNING user_id`,
    [userId, usdaEnabled],
  );
  return Boolean(row);
}

export async function updateDashboardNutrients(
  userId: string,
  nutrients: DashboardNutrient[],
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET dashboard_nutrients = $2
      WHERE user_id = $1 RETURNING user_id`,
    [userId, nutrients],
  );
  return Boolean(row);
}

export interface BodyMetrics {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  goalMode: GoalMode;
}

export async function updateBodyMetrics(
  userId: string,
  metrics: BodyMetrics,
  onboardingCompleted: boolean,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET
        height_cm = $2, weight_kg = $3, age = $4, sex = $5,
        activity_level = $6, goal_mode = $7, onboarding_completed = $8
      WHERE user_id = $1 RETURNING user_id`,
    [
      userId,
      metrics.heightCm,
      metrics.weightKg,
      metrics.age,
      metrics.sex,
      metrics.activityLevel,
      metrics.goalMode,
      onboardingCompleted,
    ],
  );
  return Boolean(row);
}

export async function completeOnboarding(userId: string): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET onboarding_completed = true
      WHERE user_id = $1 RETURNING user_id`,
    [userId],
  );
  return Boolean(row);
}

export async function setMaintenanceCalories(
  userId: string,
  maintenanceCalories: number | null,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET maintenance_calories = $2
      WHERE user_id = $1 RETURNING user_id`,
    [userId, maintenanceCalories],
  );
  return Boolean(row);
}
