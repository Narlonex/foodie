import "server-only";
import type { PoolClient } from "pg";
import { withTransaction } from "../db";
import { diaryRowsToCsv } from "../export";

type JsonRow = Record<string, unknown>;

async function arrayQuery(
  client: PoolClient,
  source: string,
  userId: string,
  orderBy = "",
): Promise<JsonRow[]> {
  const order = orderBy ? ` ORDER BY ${orderBy}` : "";
  const result = await client.query<{ data: JsonRow[] }>(
    `SELECT COALESCE(jsonb_agg(to_jsonb(t)${order}), '[]'::jsonb) AS data
       FROM (${source}) t`,
    [userId],
  );
  return result.rows[0]?.data ?? [];
}

export interface UserExport {
  app: "Foodie";
  version: 1;
  exportedAt: string;
  user: { email: string };
  profile: JsonRow | null;
  dayTypes: JsonRow[];
  dayAssignments: JsonRow[];
  diaryEntries: JsonRow[];
  foods: JsonRow[];
  savedMeals: JsonRow[];
  savedMealItems: JsonRow[];
  weightLogs: JsonRow[];
  bodyMeasurements: JsonRow[];
  dailyHabits: JsonRow[];
  mealPlan: JsonRow[];
  shoppingList: JsonRow[];
  pantry: JsonRow[];
  counts: Record<string, number>;
}

export async function exportUserData(
  userId: string,
  email: string,
): Promise<UserExport> {
  return withTransaction(async (client) => {
    const profileResult = await client.query<{ data: JsonRow | null }>(
      `SELECT to_jsonb(t) AS data
         FROM (SELECT * FROM profiles WHERE user_id = $1 LIMIT 1) t`,
      [userId],
    );

    const [
      dayTypes,
      dayAssignments,
      diaryEntries,
      foodRows,
      savedMeals,
      savedMealItems,
      weightLogs,
      bodyMeasurements,
      dailyHabits,
      mealPlan,
      shoppingList,
      pantry,
    ] = await Promise.all([
      arrayQuery(client, "SELECT * FROM day_types WHERE user_id = $1", userId),
      arrayQuery(
        client,
        "SELECT * FROM day_assignments WHERE user_id = $1",
        userId,
      ),
      arrayQuery(
        client,
        "SELECT * FROM diary_entries WHERE user_id = $1",
        userId,
        "t.date, t.logged_at",
      ),
      arrayQuery(
        client,
        "SELECT to_jsonb(f) - 'image_data' - 'image_mime' AS food FROM foods f WHERE f.user_id = $1",
        userId,
      ),
      arrayQuery(
        client,
        "SELECT * FROM saved_meals WHERE user_id = $1",
        userId,
      ),
      arrayQuery(
        client,
        `SELECT smi.* FROM saved_meal_items smi
          JOIN saved_meals sm ON sm.id = smi.saved_meal_id
         WHERE sm.user_id = $1`,
        userId,
      ),
      arrayQuery(
        client,
        "SELECT * FROM weight_logs WHERE user_id = $1",
        userId,
        "t.date",
      ),
      arrayQuery(
        client,
        "SELECT * FROM body_measurements WHERE user_id = $1",
        userId,
        "t.date",
      ),
      arrayQuery(
        client,
        "SELECT * FROM daily_habits WHERE user_id = $1",
        userId,
        "t.date",
      ),
      arrayQuery(
        client,
        "SELECT * FROM meal_plan_items WHERE user_id = $1",
        userId,
        "t.plan_date, t.created_at",
      ),
      arrayQuery(
        client,
        "SELECT * FROM shopping_list_items WHERE user_id = $1",
        userId,
        "t.created_at",
      ),
      arrayQuery(
        client,
        "SELECT * FROM pantry_items WHERE user_id = $1",
        userId,
        "t.expires_on NULLS LAST, t.name",
      ),
    ]);

    // The foods query removes binary image columns in SQL and wraps each row
    // under `food`; flatten it to the same shape as the other exports.
    const foods = foodRows.map((row) => (row.food ?? row) as JsonRow);

    return {
      app: "Foodie",
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { email },
      profile: profileResult.rows[0]?.data ?? null,
      dayTypes,
      dayAssignments,
      diaryEntries,
      foods,
      savedMeals,
      savedMealItems,
      weightLogs,
      bodyMeasurements,
      dailyHabits,
      mealPlan,
      shoppingList,
      pantry,
      counts: {
        diaryEntries: diaryEntries.length,
        foods: foods.length,
        savedMeals: savedMeals.length,
        weightLogs: weightLogs.length,
        bodyMeasurements: bodyMeasurements.length,
        dailyHabits: dailyHabits.length,
        mealPlan: mealPlan.length,
        shoppingList: shoppingList.length,
        pantry: pantry.length,
      },
    };
  });
}

export function exportDiaryCsv(data: UserExport): string {
  return diaryRowsToCsv(data.diaryEntries);
}
