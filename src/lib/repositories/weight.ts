import "server-only";
import { query, queryOne } from "../db";
import type { WeightEntry } from "../types";

interface WeightRow {
  id: string;
  date: string | Date;
  weight_kg: string | number;
}

const WEIGHT_COLUMNS = `id, date, weight_kg`;

function mapWeight(row: WeightRow): WeightEntry {
  return {
    id: row.id,
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date),
    weightKg: Number(row.weight_kg),
  };
}

export async function listWeightEntries(
  userId: string,
  since: string,
): Promise<WeightEntry[]> {
  const rows = await query<WeightRow>(
    `SELECT ${WEIGHT_COLUMNS} FROM weight_logs
      WHERE user_id = $1 AND date >= $2
      ORDER BY date`,
    [userId, since],
  );
  return rows.map(mapWeight);
}

export async function getLatestWeightEntries(
  userId: string,
  limit = 30,
): Promise<WeightEntry[]> {
  const rows = await query<WeightRow>(
    `SELECT ${WEIGHT_COLUMNS} FROM weight_logs
      WHERE user_id = $1
      ORDER BY date DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapWeight).reverse();
}

export async function upsertWeightEntry(
  userId: string,
  date: string,
  weightKg: number,
): Promise<WeightEntry> {
  const row = await queryOne<WeightRow>(
    `INSERT INTO weight_logs (user_id, date, weight_kg)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, date)
     DO UPDATE SET weight_kg = EXCLUDED.weight_kg, updated_at = now()
     RETURNING ${WEIGHT_COLUMNS}`,
    [userId, date, weightKg],
  );
  if (!row) throw new Error("Failed to save the weight entry.");
  return mapWeight(row);
}

export async function deleteWeightEntry(
  userId: string,
  entryId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM weight_logs WHERE id = $1 AND user_id = $2 RETURNING id`,
    [entryId, userId],
  );
  return Boolean(row);
}
