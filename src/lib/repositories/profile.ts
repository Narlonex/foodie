import "server-only";
import { queryOne } from "../db";
import type { GoalMode, Language, Theme, UnitSystem } from "../types";

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
