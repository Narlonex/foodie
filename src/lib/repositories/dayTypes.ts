import "server-only";
import { query, queryOne, withTransaction } from "../db";
import { deriveMacroTargets, splitFromGrams, type MacroResult } from "../macroTargets";
import type { DayType, Language, MacroAdjustmentMode, MacroSplit } from "../types";
import type { DayTypeFormInput, ManualTargetsInput } from "../validation";
import { mapDayType, type DayTypeRow } from "./mappers";

const DAY_TYPE_COLUMNS = `
  id, name, kcal, protein_g, carbs_g, fat_g, adjustment_mode,
  protein_pct, carbs_pct, fat_pct
`;

export class DuplicateDayTypeError extends Error {
  constructor() {
    super("A day type with this name already exists.");
    this.name = "DuplicateDayTypeError";
  }
}

export async function listDayTypes(userId: string): Promise<DayType[]> {
  const rows = await query<DayTypeRow>(
    `SELECT ${DAY_TYPE_COLUMNS} FROM day_types
      WHERE user_id = $1 ORDER BY lower(name)`,
    [userId],
  );
  return rows.map(mapDayType);
}

export async function getDayType(
  userId: string,
  dayTypeId: string,
): Promise<DayType | null> {
  const row = await queryOne<DayTypeRow>(
    `SELECT ${DAY_TYPE_COLUMNS} FROM day_types WHERE id = $1 AND user_id = $2`,
    [dayTypeId, userId],
  );
  return row ? mapDayType(row) : null;
}

function computeTargets(input: DayTypeFormInput): MacroResult {
  return deriveMacroTargets({
    kcal: input.kcal,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    adjustmentMode: input.adjustmentMode,
    split: {
      protein: input.proteinPct,
      carbs: input.carbsPct,
      fat: input.fatPct,
    },
  });
}

function targetParams(targets: {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  split: MacroSplit;
  adjustmentMode: MacroAdjustmentMode;
}): Array<number | string> {
  return [
    targets.kcal,
    targets.protein,
    targets.carbs,
    targets.fat,
    targets.adjustmentMode,
    targets.split.protein,
    targets.split.carbs,
    targets.split.fat,
  ];
}

export interface CreateDayTypeResult {
  ok: boolean;
  dayType?: DayType;
  macroError?: MacroResult & { ok: false };
}

export async function createDayType(
  userId: string,
  input: DayTypeFormInput,
): Promise<CreateDayTypeResult> {
  const computed = computeTargets(input);
  if (!computed.ok) return { ok: false, macroError: computed };
  const t = computed.targets;
  try {
    const row = await queryOne<DayTypeRow>(
      `INSERT INTO day_types (
        user_id, name, kcal, protein_g, carbs_g, fat_g, adjustment_mode,
        protein_pct, carbs_pct, fat_pct
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${DAY_TYPE_COLUMNS}`,
      [userId, input.name.trim(), ...targetParams({ ...t, adjustmentMode: input.adjustmentMode })],
    );
    return row ? { ok: true, dayType: mapDayType(row) } : { ok: false };
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateDayTypeError();
    throw error;
  }
}

export async function updateDayType(
  userId: string,
  dayTypeId: string,
  input: DayTypeFormInput,
): Promise<CreateDayTypeResult> {
  const computed = computeTargets(input);
  if (!computed.ok) return { ok: false, macroError: computed };
  const t = computed.targets;
  try {
    const row = await queryOne<DayTypeRow>(
      `UPDATE day_types SET
        name = $3, kcal = $4, protein_g = $5, carbs_g = $6, fat_g = $7,
        adjustment_mode = $8, protein_pct = $9, carbs_pct = $10, fat_pct = $11
      WHERE id = $1 AND user_id = $2
      RETURNING ${DAY_TYPE_COLUMNS}`,
      [
        dayTypeId,
        userId,
        input.name.trim(),
        ...targetParams({ ...t, adjustmentMode: input.adjustmentMode }),
      ],
    );
    return row ? { ok: true, dayType: mapDayType(row) } : { ok: false };
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateDayTypeError();
    throw error;
  }
}

/**
 * Writes all four targets exactly as entered. Used by Nutrition Goals so the
 * user can override any target without going through a day-type form. The
 * stored split follows the entered grams so later calorie changes stay
 * sensible, and the day type's adjustment mode is left untouched.
 */
export async function updateDayTypeTargets(
  userId: string,
  dayTypeId: string,
  input: ManualTargetsInput,
): Promise<DayType | null> {
  const targets = {
    kcal: input.kcal,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
  };
  const split = splitFromGrams(targets);
  const row = await queryOne<DayTypeRow>(
    `UPDATE day_types SET
      kcal = $3, protein_g = $4, carbs_g = $5, fat_g = $6,
      protein_pct = $7, carbs_pct = $8, fat_pct = $9
    WHERE id = $1 AND user_id = $2
    RETURNING ${DAY_TYPE_COLUMNS}`,
    [
      dayTypeId,
      userId,
      targets.kcal,
      targets.protein,
      targets.carbs,
      targets.fat,
      split.protein,
      split.carbs,
      split.fat,
    ],
  );
  return row ? mapDayType(row) : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export type DeleteDayTypeResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "assigned" | "default"; assignedDates: number };

export async function deleteDayType(
  userId: string,
  dayTypeId: string,
): Promise<DeleteDayTypeResult> {
  return withTransaction(async (client) => {
    const exists = await client.query<{ id: string }>(
      `SELECT id FROM day_types WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [dayTypeId, userId],
    );
    if (exists.rowCount === 0) {
      return { ok: false, reason: "not-found", assignedDates: 0 };
    }

    const assignments = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM day_assignments
        WHERE user_id = $1 AND day_type_id = $2`,
      [userId, dayTypeId],
    );
    const assignedDates = Number(assignments.rows[0]?.count ?? 0);
    if (assignedDates > 0) {
      return { ok: false, reason: "assigned", assignedDates };
    }

    const isDefault = await client.query<{ user_id: string }>(
      `SELECT user_id FROM profiles
        WHERE user_id = $1 AND default_day_type_id = $2`,
      [userId, dayTypeId],
    );
    if ((isDefault.rowCount ?? 0) > 0) {
      return { ok: false, reason: "default", assignedDates: 0 };
    }

    await client.query(`DELETE FROM day_types WHERE id = $1 AND user_id = $2`, [
      dayTypeId,
      userId,
    ]);
    return { ok: true };
  });
}

export async function setDefaultDayType(
  userId: string,
  dayTypeId: string,
): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE profiles SET default_day_type_id = $2
      WHERE user_id = $1 AND EXISTS (
        SELECT 1 FROM day_types WHERE id = $2 AND user_id = $1
      ) RETURNING user_id`,
    [userId, dayTypeId],
  );
  return Boolean(row);
}

export async function setDayTypeForDate(
  userId: string,
  date: string,
  dayTypeId: string | null,
): Promise<boolean> {
  if (dayTypeId === null) {
    await queryOne(
      `DELETE FROM day_assignments WHERE user_id = $1 AND date = $2`,
      [userId, date],
    );
    return true;
  }
  const row = await queryOne<{ day_type_id: string }>(
    `INSERT INTO day_assignments (user_id, date, day_type_id)
     SELECT $1, $2, $3
      WHERE EXISTS (SELECT 1 FROM day_types WHERE id = $3 AND user_id = $1)
     ON CONFLICT (user_id, date)
     DO UPDATE SET day_type_id = EXCLUDED.day_type_id
     RETURNING day_type_id`,
    [userId, date, dayTypeId],
  );
  return Boolean(row);
}

export interface EffectiveDayType {
  dayType: DayType | null;
  assignedDayTypeId: string | null;
}

interface EffectiveRow extends DayTypeRow {
  assigned_day_type_id: string | null;
}

export async function getEffectiveDayType(
  userId: string,
  date: string,
): Promise<EffectiveDayType> {
  const row = await queryOne<EffectiveRow>(
    `SELECT ${DAY_TYPE_COLUMNS}
            , da.day_type_id AS assigned_day_type_id
       FROM profiles p
       LEFT JOIN day_assignments da
              ON da.user_id = p.user_id AND da.date = $2
       LEFT JOIN day_types dt
              ON dt.id = COALESCE(da.day_type_id, p.default_day_type_id)
             AND dt.user_id = p.user_id
      WHERE p.user_id = $1`,
    [userId, date],
  );
  if (!row || !row.id) {
    return { dayType: null, assignedDayTypeId: row?.assigned_day_type_id ?? null };
  }
  return {
    dayType: mapDayType(row),
    assignedDayTypeId: row.assigned_day_type_id,
  };
}

export async function listAssignmentsForDayType(
  userId: string,
  dayTypeId: string,
): Promise<string[]> {
  const rows = await query<{ date: string }>(
    `SELECT date FROM day_assignments
      WHERE user_id = $1 AND day_type_id = $2 ORDER BY date`,
    [userId, dayTypeId],
  );
  return rows.map((row) => row.date);
}

export async function getDayTypesForDates(
  userId: string,
  dates: string[],
): Promise<Map<string, DayType | null>> {
  const result = new Map<string, DayType | null>();
  if (dates.length === 0) return result;
  const rows = await query<EffectiveRow & { requested_date: string }>(
    `SELECT dates.requested_date, ${DAY_TYPE_COLUMNS},
            da.day_type_id AS assigned_day_type_id
       FROM unnest($2::date[]) AS dates(requested_date)
       LEFT JOIN profiles p ON p.user_id = $1
       LEFT JOIN day_assignments da
              ON da.user_id = $1 AND da.date = dates.requested_date
       LEFT JOIN day_types dt
              ON dt.id = COALESCE(da.day_type_id, p.default_day_type_id)
             AND dt.user_id = $1`,
    [userId, dates],
  );
  for (const date of dates) result.set(date, null);
  for (const row of rows) {
    result.set(row.requested_date, row.id ? mapDayType(row) : null);
  }
  return result;
}

export const DEFAULT_DAY_TYPE_KCAL = 2000;

export function defaultDayTypeName(language: Language): string {
  switch (language) {
    case "sk":
      return "Štandardný deň";
    case "cs":
      return "Standardní den";
    default:
      return "Standard day";
  }
}

export function defaultDayTypeInput(language: Language): DayTypeFormInput {
  const computed = deriveMacroTargets({
    kcal: DEFAULT_DAY_TYPE_KCAL,
    protein: 150,
    carbs: 200,
    fat: 66.67,
    adjustmentMode: "all",
    split: { protein: 30, carbs: 40, fat: 30 },
  });
  if (!computed.ok) {
    throw new Error("Default day type targets are invalid.");
  }
  return {
    name: defaultDayTypeName(language),
    kcal: computed.targets.kcal,
    protein: computed.targets.protein,
    carbs: computed.targets.carbs,
    fat: computed.targets.fat,
    adjustmentMode: "all",
    proteinPct: computed.targets.split.protein,
    carbsPct: computed.targets.split.carbs,
    fatPct: computed.targets.split.fat,
  };
}
