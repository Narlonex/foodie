import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../db";
import { entryPortion, totalNutrients } from "../nutrition";
import type {
  AmountUnit,
  DayType,
  DiaryEntry,
  DiaryTotals,
  Meal,
} from "../types";
import type { Food } from "../types";
import { foodInputToDraft, persistFoodDraft, type FoodDraft } from "./foods";
import { mapEntry, mapFood, type EntryRow, type FoodRow } from "./mappers";
import { getDayTypesForDates, getEffectiveDayType } from "./dayTypes";
import type { FoodInput } from "../validation";

const ENTRY_COLUMNS = `
  id, date, meal, food_id, source, name, brand, barcode, basis_type,
  serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g, fat_g,
  sat_fat_g, fiber_g, salt_g, energy_source, amount, amount_unit, logged_at
`;

export class ExistingEntriesError extends Error {
  constructor() {
    super("The destination already contains entries.");
    this.name = "ExistingEntriesError";
  }
}

function assertUnitMatchesInternal(food: Food | DiaryEntry, amountUnit: AmountUnit): void {
  const expected =
    food.basisType === "100g" ? "g" : food.basisType === "100ml" ? "ml" : "serving";
  if (amountUnit !== expected) {
    throw new Error("Amount unit does not match the food's nutrition basis.");
  }
}

async function selectFoodForUpdate(
  client: PoolClient,
  userId: string,
  foodId: string,
): Promise<Food | null> {
  const result = await client.query<FoodRow>(
    `SELECT id, source, external_id, barcode, name, brand, basis_type,
            serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g,
            fat_g, sat_fat_g, fiber_g, salt_g, energy_source, is_favorite
       FROM foods WHERE id = $1 AND user_id = $2`,
    [foodId, userId],
  );
  const row = result.rows[0];
  return row ? mapFood(row) : null;
}

export async function insertEntryWithFood(
  client: PoolClient,
  userId: string,
  food: Food,
  date: string,
  meal: Meal,
  amount: number,
  amountUnit: AmountUnit,
): Promise<DiaryEntry> {
  assertUnitMatchesInternal(food, amountUnit);
  const result = await client.query<EntryRow>(
    `INSERT INTO diary_entries (
      user_id, date, meal, food_id, source, name, brand, barcode, basis_type,
      serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g,
      fat_g, sat_fat_g, fiber_g, salt_g, energy_source, amount, amount_unit
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23
    ) RETURNING ${ENTRY_COLUMNS}`,
    [
      userId,
      date,
      meal,
      food.id ?? null,
      food.source,
      food.name,
      food.brand,
      food.barcode,
      food.basisType,
      food.servingSize,
      food.servingUnit,
      food.nutrients.kcal,
      food.nutrients.kj,
      food.nutrients.protein,
      food.nutrients.carbs,
      food.nutrients.sugars,
      food.nutrients.fat,
      food.nutrients.satFat,
      food.nutrients.fiber,
      food.nutrients.salt,
      food.energySource,
      amount,
      amountUnit,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to add the diary entry.");
  return mapEntry(row);
}

export async function listEntriesForDate(
  userId: string,
  date: string,
): Promise<DiaryEntry[]> {
  const rows = await query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM diary_entries
      WHERE user_id = $1 AND date = $2
      ORDER BY
        CASE meal WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2
                  WHEN 'dinner' THEN 3 ELSE 4 END,
        logged_at, created_at`,
    [userId, date],
  );
  return rows.map(mapEntry);
}

export async function listEntriesForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DiaryEntry[]> {
  const rows = await query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM diary_entries
      WHERE user_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date, logged_at, created_at`,
    [userId, startDate, endDate],
  );
  return rows.map(mapEntry);
}

export async function getEntry(
  userId: string,
  entryId: string,
): Promise<DiaryEntry | null> {
  const row = await queryOne<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM diary_entries
      WHERE id = $1 AND user_id = $2`,
    [entryId, userId],
  );
  return row ? mapEntry(row) : null;
}

export async function logFoodById(
  userId: string,
  foodId: string,
  date: string,
  meal: Meal,
  amount: number,
  amountUnit: AmountUnit,
): Promise<DiaryEntry> {
  return withTransaction(async (client) => {
    const food = await selectFoodForUpdate(client, userId, foodId);
    if (!food) throw new Error("Food not found.");
    return insertEntryWithFood(client, userId, food, date, meal, amount, amountUnit);
  });
}

export async function logExternalFood(
  userId: string,
  draft: FoodDraft,
  date: string,
  meal: Meal,
  amount: number,
  amountUnit: AmountUnit,
): Promise<DiaryEntry> {
  return withTransaction(async (client) => {
    const food = await persistFoodDraft(client, userId, draft, false);
    return insertEntryWithFood(client, userId, food, date, meal, amount, amountUnit);
  });
}

export async function updateEntry(
  userId: string,
  entryId: string,
  input: { meal: Meal; amount: number; amountUnit: AmountUnit },
): Promise<DiaryEntry | null> {
  return withTransaction(async (client) => {
    const existing = await client.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM diary_entries
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [entryId, userId],
    );
    const entry = existing.rows[0];
    if (!entry) return null;
    assertUnitMatchesInternal(mapEntry(entry), input.amountUnit);
    const result = await client.query<EntryRow>(
      `UPDATE diary_entries
          SET meal = $3, amount = $4, amount_unit = $5
        WHERE id = $1 AND user_id = $2
        RETURNING ${ENTRY_COLUMNS}`,
      [entryId, userId, input.meal, input.amount, input.amountUnit],
    );
    const row = result.rows[0];
    return row ? mapEntry(row) : null;
  });
}

export async function deleteEntry(
  userId: string,
  entryId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM diary_entries WHERE id = $1 AND user_id = $2 RETURNING id`,
    [entryId, userId],
  );
  return Boolean(row);
}

export async function countEntriesForDate(
  userId: string,
  date: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM diary_entries
      WHERE user_id = $1 AND date = $2`,
    [userId, date],
  );
  return Number(row?.count ?? 0);
}

export interface CopyPreview {
  sourceDate: string;
  targetDate: string;
  sourceCount: number;
  targetCount: number;
  hasSourceAssignment: boolean;
}

export async function previewCopyDay(
  userId: string,
  sourceDate: string,
  targetDate: string,
): Promise<CopyPreview> {
  const [counts, assignment] = await Promise.all([
    query<{ date: string; count: string }>(
      `SELECT date, count(*)::text AS count FROM diary_entries
        WHERE user_id = $1 AND date IN ($2, $3) GROUP BY date`,
      [userId, sourceDate, targetDate],
    ),
    queryOne<{ day_type_id: string }>(
      `SELECT day_type_id FROM day_assignments
        WHERE user_id = $1 AND date = $2`,
      [userId, sourceDate],
    ),
  ]);
  const byDate = new Map(counts.map((row) => [row.date, Number(row.count)]));
  return {
    sourceDate,
    targetDate,
    sourceCount: byDate.get(sourceDate) ?? 0,
    targetCount: byDate.get(targetDate) ?? 0,
    hasSourceAssignment: Boolean(assignment),
  };
}

export async function copyDay(
  userId: string,
  sourceDate: string,
  targetDate: string,
  options: { allowExisting: boolean; copyDayType: boolean },
): Promise<{ copied: number }> {
  if (sourceDate === targetDate) {
    throw new Error("Source and destination dates must differ.");
  }
  return withTransaction(async (client) => {
    const entries = await client.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM diary_entries
        WHERE user_id = $1 AND date = $2 ORDER BY logged_at, created_at`,
      [userId, sourceDate],
    );
    const destination = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM diary_entries
        WHERE user_id = $1 AND date = $2`,
      [userId, targetDate],
    );
    if (
      Number(destination.rows[0]?.count ?? 0) > 0 &&
      !options.allowExisting
    ) {
      throw new ExistingEntriesError();
    }

    for (const row of entries.rows) {
      const entry = mapEntry(row);
      await insertEntryWithFood(
        client,
        userId,
        entryAsFood(entry),
        targetDate,
        entry.meal,
        entry.amount,
        entry.amountUnit,
      );
    }

    if (options.copyDayType) {
      const assignment = await client.query<{ day_type_id: string }>(
        `SELECT day_type_id FROM day_assignments
          WHERE user_id = $1 AND date = $2`,
        [userId, sourceDate],
      );
      const dayTypeId = assignment.rows[0]?.day_type_id;
      if (dayTypeId) {
        await client.query(
          `INSERT INTO day_assignments (user_id, date, day_type_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, date)
           DO UPDATE SET day_type_id = EXCLUDED.day_type_id`,
          [userId, targetDate, dayTypeId],
        );
      } else {
        await client.query(
          `DELETE FROM day_assignments WHERE user_id = $1 AND date = $2`,
          [userId, targetDate],
        );
      }
    }

    return { copied: entries.rowCount ?? 0 };
  });
}

export async function previewRepeatMeal(
  userId: string,
  sourceDate: string,
  sourceMeal: Meal,
  targetDate: string,
  targetMeal: Meal,
): Promise<{ sourceCount: number; targetCount: number }> {
  const rows = await query<{ source_count: string; target_count: string }>(
    `SELECT
       (SELECT count(*) FROM diary_entries
         WHERE user_id = $1 AND date = $2 AND meal = $3)::text AS source_count,
       (SELECT count(*) FROM diary_entries
         WHERE user_id = $1 AND date = $4 AND meal = $5)::text AS target_count`,
    [userId, sourceDate, sourceMeal, targetDate, targetMeal],
  );
  return {
    sourceCount: Number(rows[0]?.source_count ?? 0),
    targetCount: Number(rows[0]?.target_count ?? 0),
  };
}

export async function repeatMeal(
  userId: string,
  sourceDate: string,
  sourceMeal: Meal,
  targetDate: string,
  targetMeal: Meal,
  options: { allowExisting: boolean },
): Promise<{ copied: number }> {
  return withTransaction(async (client) => {
    const entries = await client.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM diary_entries
        WHERE user_id = $1 AND date = $2 AND meal = $3
        ORDER BY logged_at, created_at`,
      [userId, sourceDate, sourceMeal],
    );
    const destination = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM diary_entries
        WHERE user_id = $1 AND date = $2 AND meal = $3`,
      [userId, targetDate, targetMeal],
    );
    if (
      Number(destination.rows[0]?.count ?? 0) > 0 &&
      !options.allowExisting
    ) {
      throw new ExistingEntriesError();
    }
    for (const row of entries.rows) {
      const entry = mapEntry(row);
      await insertEntryWithFood(
        client,
        userId,
        entryAsFood(entry),
        targetDate,
        targetMeal,
        entry.amount,
        entry.amountUnit,
      );
    }
    return { copied: entries.rowCount ?? 0 };
  });
}

export interface DayTotals {
  date: string;
  totals: DiaryTotals;
  entries: DiaryEntry[];
  dayType: DayType | null;
  assignedDayTypeId: string | null;
}

export function totalsForEntries(entries: DiaryEntry[]): DiaryTotals {
  return totalNutrients(
    entries.map((entry) => {
      const portion = entryPortion(entry);
      return {
        nutrients: portion.nutrients,
        energySource: entry.energySource,
      };
    }),
  );
}

export async function getDayTotals(
  userId: string,
  date: string,
): Promise<DayTotals> {
  const [entries, effective] = await Promise.all([
    listEntriesForDate(userId, date),
    getEffectiveDayType(userId, date),
  ]);
  return {
    date,
    entries,
    totals: totalsForEntries(entries),
    dayType: effective.dayType,
    assignedDayTypeId: effective.assignedDayTypeId,
  };
}

export interface WeekDayTotals {
  date: string;
  totals: DiaryTotals;
  entryCount: number;
  dayType: DayType | null;
}

export async function getWeekTotals(
  userId: string,
  dates: string[],
): Promise<WeekDayTotals[]> {
  const [entries, dayTypes] = await Promise.all([
    listEntriesForRange(userId, dates[0] ?? "", dates[dates.length - 1] ?? ""),
    getDayTypesForDates(userId, dates),
  ]);
  const grouped = new Map<string, DiaryEntry[]>();
  for (const date of dates) grouped.set(date, []);
  for (const entry of entries) {
    grouped.get(entry.date)?.push(entry);
  }
  return dates.map((date) => {
    const dayEntries = grouped.get(date) ?? [];
    return {
      date,
      totals: totalsForEntries(dayEntries),
      entryCount: dayEntries.length,
      dayType: dayTypes.get(date) ?? null,
    };
  });
}

export function entryAsFood(entry: DiaryEntry): Food {
  return {
    id: entry.foodId ?? undefined,
    source: entry.source,
    externalId: null,
    barcode: entry.barcode,
    name: entry.name,
    brand: entry.brand,
    isFavorite: false,
    basisType: entry.basisType,
    servingSize: entry.servingSize,
    servingUnit: entry.servingUnit,
    nutrients: entry.nutrients,
    energySource: entry.energySource,
  };
}

export function draftFromInput(input: FoodInput): FoodDraft {
  return foodInputToDraft(input);
}
