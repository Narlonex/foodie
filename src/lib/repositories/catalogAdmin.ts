import "server-only";
import { query, queryOne, withTransaction } from "../db";
import { normalizeFoodName } from "../foods/merge";
import type { Nutrients } from "../types";

export interface FoodSubmissionInput {
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  basisType: "100g" | "100ml" | "serving";
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
  nutrients: Nutrients;
  notes?: string | null;
}

export interface FoodSubmission {
  id: string;
  userId: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  basisType: "100g" | "100ml" | "serving";
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
  nutrients: Nutrients;
  notes: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  catalogFoodId: string | null;
}

export interface ImportRun {
  id: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  written: number;
  failedQueries: number;
  notes: string | null;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  basis_type: "100g" | "100ml" | "serving";
  serving_size: string | number | null;
  serving_unit: "g" | "ml" | null;
  nutrients: Nutrients;
  notes: string | null;
  review_note: string | null;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  catalog_food_id: string | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSubmission(row: SubmissionRow): FoodSubmission {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    status: row.status,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    category: row.category,
    basisType: row.basis_type,
    servingSize: numberOrNull(row.serving_size),
    servingUnit: row.serving_unit,
    nutrients: row.nutrients,
    notes: row.notes,
    reviewNote: row.review_note,
    createdAt: iso(row.created_at) ?? "",
    reviewedAt: iso(row.reviewed_at),
    catalogFoodId: row.catalog_food_id,
  };
}

const SUBMISSION_COLUMNS = `
  s.id, s.user_id, u.email, s.status, s.name, s.brand, s.barcode, s.category,
  s.basis_type, s.serving_size, s.serving_unit, s.nutrients, s.notes,
  s.review_note, s.created_at, s.reviewed_at, s.catalog_food_id
`;

export async function createFoodSubmission(
  userId: string,
  input: FoodSubmissionInput,
): Promise<string> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error("foods.submitNameRequired");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO food_submissions
       (user_id, name, brand, barcode, category, basis_type, serving_size,
        serving_unit, nutrients, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     RETURNING id`,
    [
      userId,
      name,
      input.brand?.trim().slice(0, 200) || null,
      input.barcode || null,
      input.category.slice(0, 40) || "other",
      input.basisType,
      input.servingSize,
      input.servingUnit,
      JSON.stringify(input.nutrients),
      input.notes?.trim().slice(0, 1000) || null,
    ],
  );
  if (!row) throw new Error("foods.submitFailed");
  return row.id;
}

export async function listFoodSubmissions(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
  limit = 50,
): Promise<FoodSubmission[]> {
  const rows = await query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS}
       FROM food_submissions s
       JOIN users u ON u.id = s.user_id
      WHERE ($1 = 'all' OR s.status = $1)
      ORDER BY s.created_at DESC
      LIMIT $2`,
    [status, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(mapSubmission);
}

/**
 * Approving a submission creates a verified shared catalog row. Rejecting
 * keeps the user's private food untouched; only the shared copy is affected.
 */
export async function reviewFoodSubmission(
  submissionId: string,
  adminId: string,
  approve: boolean,
  note: string | null = null,
): Promise<FoodSubmission | null> {
  return withTransaction(async (client) => {
    const selected = await client.query<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS}
         FROM food_submissions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.status = 'pending'
        FOR UPDATE OF s`,
      [submissionId],
    );
    const submission = selected.rows[0];
    if (!submission) return null;

    if (!approve) {
      await client.query(
        `UPDATE food_submissions
            SET status = 'rejected', review_note = $2, reviewed_by = $3,
                reviewed_at = now()
          WHERE id = $1`,
        [submissionId, note, adminId],
      );
      const updated = await client.query<SubmissionRow>(
        `SELECT ${SUBMISSION_COLUMNS}
           FROM food_submissions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = $1`,
        [submissionId],
      );
      return updated.rows[0] ? mapSubmission(updated.rows[0]) : null;
    }

    const normalized = normalizeFoodName(submission.name);
    const brandKey = submission.brand
      ? normalizeFoodName(submission.brand)
      : "";
    const searchText = [
      normalized,
      brandKey,
      normalizeFoodName(submission.category),
    ]
      .filter(Boolean)
      .join(" ");
    const externalId = `foodie:${submission.id}`;
    const nutrients = submission.nutrients;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO catalog_foods
         (source, external_id, barcode, name, normalized_name, search_text,
          brand, category, basis_type, serving_size, serving_unit, kcal, kj,
          protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g,
          energy_source, preparation, verified, verified_at)
       VALUES ('off', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19,
               'provided', 'unspecified', true, now())
       RETURNING id`,
      [
        externalId,
        submission.barcode,
        submission.name,
        normalized,
        searchText,
        submission.brand,
        submission.category,
        submission.basis_type,
        numberOrNull(submission.serving_size),
        submission.serving_unit,
        nutrients.kcal,
        nutrients.kj,
        nutrients.protein,
        nutrients.carbs,
        nutrients.sugars,
        nutrients.fat,
        nutrients.satFat,
        nutrients.fiber,
        nutrients.salt,
      ],
    );
    const catalogId = inserted.rows[0]?.id;
    if (!catalogId) throw new Error("admin.approveFailed");

    await client.query(
      `UPDATE food_submissions
          SET status = 'approved', catalog_food_id = $2, review_note = $3,
              reviewed_by = $4, reviewed_at = now()
        WHERE id = $1`,
      [submissionId, catalogId, note, adminId],
    );
    const updated = await client.query<SubmissionRow>(
      `SELECT ${SUBMISSION_COLUMNS}
         FROM food_submissions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1`,
      [submissionId],
    );
    return updated.rows[0] ? mapSubmission(updated.rows[0]) : null;
  });
}

export async function listCatalogImportRuns(limit = 10): Promise<ImportRun[]> {
  const rows = await query<{
    id: string;
    source: string;
    started_at: string | Date;
    finished_at: string | Date | null;
    fetched: number;
    written: number;
    failed_queries: number;
    notes: string | null;
  }>(
    `SELECT id, source, started_at, finished_at, fetched, written,
            failed_queries, notes
       FROM catalog_import_runs
      ORDER BY started_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    startedAt: iso(row.started_at) ?? "",
    finishedAt: iso(row.finished_at),
    fetched: row.fetched,
    written: row.written,
    failedQueries: row.failed_queries,
    notes: row.notes,
  }));
}

export async function listRecentCatalogFoods(limit = 12): Promise<
  Array<{
    id: string;
    name: string;
    brand: string | null;
    category: string;
    verified: boolean;
    source: string;
    createdAt: string;
  }>
> {
  const rows = await query<{
    id: string;
    name: string;
    brand: string | null;
    category: string;
    verified: boolean;
    source: string;
    created_at: string | Date;
  }>(
    `SELECT id, name, brand, category, verified, source, created_at
       FROM catalog_foods
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    verified: row.verified,
    source: row.source,
    createdAt: iso(row.created_at) ?? "",
  }));
}
