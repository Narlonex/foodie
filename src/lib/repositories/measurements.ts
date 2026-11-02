import "server-only";
import { query, queryOne } from "../db";
import type { BodyMeasurement } from "../types";

interface MeasurementRow {
  id: string;
  date: string | Date;
  waist_cm: string | null;
  hips_cm: string | null;
  chest_cm: string | null;
  thigh_cm: string | null;
  arm_cm: string | null;
}

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapMeasurement(row: MeasurementRow): BodyMeasurement {
  return {
    id: row.id,
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date),
    waistCm: optionalNumber(row.waist_cm),
    hipsCm: optionalNumber(row.hips_cm),
    chestCm: optionalNumber(row.chest_cm),
    thighCm: optionalNumber(row.thigh_cm),
    armCm: optionalNumber(row.arm_cm),
  };
}

export interface MeasurementInput {
  date: string;
  waistCm: number | null;
  hipsCm: number | null;
  chestCm: number | null;
  thighCm: number | null;
  armCm: number | null;
}

export async function listBodyMeasurements(
  userId: string,
  limit = 24,
): Promise<BodyMeasurement[]> {
  const rows = await query<MeasurementRow>(
    `SELECT id, date, waist_cm, hips_cm, chest_cm, thigh_cm, arm_cm
       FROM body_measurements
      WHERE user_id = $1
      ORDER BY date DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapMeasurement).reverse();
}

export async function saveBodyMeasurement(
  userId: string,
  input: MeasurementInput,
): Promise<BodyMeasurement> {
  const row = await queryOne<MeasurementRow>(
    `INSERT INTO body_measurements
       (user_id, date, waist_cm, hips_cm, chest_cm, thigh_cm, arm_cm)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, date) DO UPDATE
       SET waist_cm = EXCLUDED.waist_cm,
           hips_cm = EXCLUDED.hips_cm,
           chest_cm = EXCLUDED.chest_cm,
           thigh_cm = EXCLUDED.thigh_cm,
           arm_cm = EXCLUDED.arm_cm,
           updated_at = now()
     RETURNING id, date, waist_cm, hips_cm, chest_cm, thigh_cm, arm_cm`,
    [
      userId,
      input.date,
      input.waistCm,
      input.hipsCm,
      input.chestCm,
      input.thighCm,
      input.armCm,
    ],
  );
  if (!row) throw new Error("Failed to save the body measurement.");
  return mapMeasurement(row);
}

export async function deleteBodyMeasurement(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM body_measurements WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return Boolean(row);
}
