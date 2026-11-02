import "server-only";
import { query, queryOne } from "../db";
import type { HabitDay } from "../types";

interface HabitRow {
  date: string | Date;
  water_ml: number;
  caffeine_mg: number;
  alcohol_units: string | number;
}

function mapHabit(row: HabitRow): HabitDay {
  return {
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date),
    waterMl: Number(row.water_ml),
    caffeineMg: Number(row.caffeine_mg),
    alcoholUnits: Number(row.alcohol_units),
  };
}

export async function getHabitDay(
  userId: string,
  date: string,
): Promise<HabitDay | null> {
  const row = await queryOne<HabitRow>(
    `SELECT date, water_ml, caffeine_mg, alcohol_units
       FROM daily_habits WHERE user_id = $1 AND date = $2`,
    [userId, date],
  );
  return row ? mapHabit(row) : null;
}

export async function listHabitDays(
  userId: string,
  since: string,
): Promise<HabitDay[]> {
  const rows = await query<HabitRow>(
    `SELECT date, water_ml, caffeine_mg, alcohol_units
       FROM daily_habits
      WHERE user_id = $1 AND date >= $2
      ORDER BY date`,
    [userId, since],
  );
  return rows.map(mapHabit);
}

export async function saveHabitDay(
  userId: string,
  day: HabitDay,
): Promise<HabitDay> {
  const row = await queryOne<HabitRow>(
    `INSERT INTO daily_habits (user_id, date, water_ml, caffeine_mg, alcohol_units)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, date) DO UPDATE
       SET water_ml = EXCLUDED.water_ml,
           caffeine_mg = EXCLUDED.caffeine_mg,
           alcohol_units = EXCLUDED.alcohol_units,
           updated_at = now()
     RETURNING date, water_ml, caffeine_mg, alcohol_units`,
    [userId, day.date, day.waterMl, day.caffeineMg, day.alcoholUnits],
  );
  if (!row) throw new Error("Failed to save the daily habits.");
  return mapHabit(row);
}
