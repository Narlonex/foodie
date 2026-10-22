import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../db";
import { normalizeNutrients } from "../nutrition";
import {
  basisTypeSchema,
  foodSourceSchema,
  type FoodInput,
} from "../validation";
import { mapFood, type FoodRow } from "./mappers";
import type { Food, FoodSource } from "../types";

type Runner = Pick<PoolClient, "query">;

const FOOD_COLUMNS = `
  id, source, external_id, barcode, name, brand, basis_type, serving_size,
  serving_unit, kcal, kj, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
  fiber_g, salt_g, energy_source, is_favorite
`;

const FOOD_COLUMNS_QUALIFIED = `
  f.id, f.source, f.external_id, f.barcode, f.name, f.brand, f.basis_type,
  f.serving_size, f.serving_unit, f.kcal, f.kj, f.protein_g, f.carbs_g,
  f.sugars_g, f.fat_g, f.sat_fat_g, f.fiber_g, f.salt_g, f.energy_source,
  f.is_favorite
`;

export interface FoodDraft {
  source: FoodSource;
  externalId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  basisType: FoodInput["basisType"];
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
  nutrients: FoodInput["nutrients"];
}

export function foodInputToDraft(input: FoodInput): FoodDraft {
  return {
    source: input.source,
    externalId: input.externalId?.trim() || null,
    barcode: input.barcode?.trim() || null,
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    basisType: input.basisType,
    servingSize: input.servingSize,
    servingUnit: input.servingUnit,
    nutrients: input.nutrients,
  };
}

function normalizedDraft(draft: FoodDraft) {
  const normalized = normalizeNutrients(draft.nutrients);
  return {
    ...draft,
    nutrients: normalized.nutrients,
    energySource: normalized.energySource,
  };
}

export async function persistFoodDraft(
  runner: Runner,
  userId: string,
  draft: FoodDraft,
  favorite = false,
  existingId?: string,
): Promise<Food> {
  const normalized = normalizedDraft(draft);
  const params = [
    userId,
    normalized.source,
    normalized.externalId,
    normalized.barcode,
    normalized.name,
    normalized.brand,
    normalized.basisType,
    normalized.servingSize,
    normalized.servingUnit,
    normalized.nutrients.kcal,
    normalized.nutrients.kj,
    normalized.nutrients.protein,
    normalized.nutrients.carbs,
    normalized.nutrients.sugars,
    normalized.nutrients.fat,
    normalized.nutrients.satFat,
    normalized.nutrients.fiber,
    normalized.nutrients.salt,
    normalized.energySource,
    favorite,
  ];

  if (normalized.source === "custom" && !existingId) {
    const result = await runner.query<FoodRow>(
      `INSERT INTO foods (
        user_id, source, external_id, barcode, name, brand, basis_type,
        serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g,
        fat_g, sat_fat_g, fiber_g, salt_g, energy_source, is_favorite
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20
      ) RETURNING ${FOOD_COLUMNS}`,
      params,
    );
    const row = result.rows[0];
    if (!row) throw new Error("Failed to create food.");
    return mapFood(row);
  }

  if (existingId) {
    const result = await runner.query<FoodRow>(
      `UPDATE foods SET
        barcode = $3, name = $4, brand = $5, basis_type = $6,
        serving_size = $7, serving_unit = $8, kcal = $9, kj = $10,
        protein_g = $11, carbs_g = $12, sugars_g = $13, fat_g = $14,
        sat_fat_g = $15, fiber_g = $16, salt_g = $17, energy_source = $18,
        is_favorite = is_favorite OR $19
      WHERE id = $2 AND user_id = $1 AND source = 'custom'
      RETURNING ${FOOD_COLUMNS}`,
      [
        userId,
        existingId,
        normalized.barcode,
        normalized.name,
        normalized.brand,
        normalized.basisType,
        normalized.servingSize,
        normalized.servingUnit,
        normalized.nutrients.kcal,
        normalized.nutrients.kj,
        normalized.nutrients.protein,
        normalized.nutrients.carbs,
        normalized.nutrients.sugars,
        normalized.nutrients.fat,
        normalized.nutrients.satFat,
        normalized.nutrients.fiber,
        normalized.nutrients.salt,
        normalized.energySource,
        favorite,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Food not found or not editable.");
    return mapFood(row);
  }

  if (!normalized.externalId) {
    throw new Error("External foods need a source identifier.");
  }

  const result = await runner.query<FoodRow>(
    `INSERT INTO foods (
      user_id, source, external_id, barcode, name, brand, basis_type,
      serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g,
      fat_g, sat_fat_g, fiber_g, salt_g, energy_source, is_favorite
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20
    )
    ON CONFLICT (user_id, source, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      barcode = EXCLUDED.barcode,
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      basis_type = EXCLUDED.basis_type,
      serving_size = EXCLUDED.serving_size,
      serving_unit = EXCLUDED.serving_unit,
      kcal = EXCLUDED.kcal,
      kj = EXCLUDED.kj,
      protein_g = EXCLUDED.protein_g,
      carbs_g = EXCLUDED.carbs_g,
      sugars_g = EXCLUDED.sugars_g,
      fat_g = EXCLUDED.fat_g,
      sat_fat_g = EXCLUDED.sat_fat_g,
      fiber_g = EXCLUDED.fiber_g,
      salt_g = EXCLUDED.salt_g,
      energy_source = EXCLUDED.energy_source,
      is_favorite = foods.is_favorite OR EXCLUDED.is_favorite,
      updated_at = now()
    RETURNING ${FOOD_COLUMNS}`,
    params,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to save food.");
  return mapFood(row);
}

export async function listCustomFoods(userId: string): Promise<Food[]> {
  const rows = await query<FoodRow>(
    `SELECT ${FOOD_COLUMNS} FROM foods
      WHERE user_id = $1 AND source = 'custom'
      ORDER BY lower(name), created_at`,
    [userId],
  );
  return rows.map(mapFood);
}

export async function listFavoriteFoods(userId: string): Promise<Food[]> {
  const rows = await query<FoodRow>(
    `SELECT ${FOOD_COLUMNS} FROM foods
      WHERE user_id = $1 AND is_favorite = true
      ORDER BY lower(name)`,
    [userId],
  );
  return rows.map(mapFood);
}

export async function listRecentFoods(
  userId: string,
  limit = 10,
): Promise<Food[]> {
  const rows = await query<FoodRow>(
    `SELECT ${FOOD_COLUMNS_QUALIFIED}
       FROM foods f
       JOIN (
         SELECT food_id, MAX(logged_at) AS last_used
           FROM diary_entries
          WHERE user_id = $1 AND food_id IS NOT NULL
          GROUP BY food_id
       ) recent ON recent.food_id = f.id
      WHERE f.user_id = $1
      ORDER BY recent.last_used DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapFood);
}

export async function getOwnedFood(
  userId: string,
  foodId: string,
): Promise<Food | null> {
  const row = await queryOne<FoodRow>(
    `SELECT ${FOOD_COLUMNS} FROM foods WHERE id = $1 AND user_id = $2`,
    [foodId, userId],
  );
  return row ? mapFood(row) : null;
}

export async function createCustomFood(
  userId: string,
  draft: FoodDraft,
  favorite = false,
): Promise<Food> {
  return withTransaction((client) =>
    persistFoodDraft(client, userId, { ...draft, source: "custom", externalId: null }, favorite),
  );
}

export async function updateCustomFood(
  userId: string,
  foodId: string,
  draft: FoodDraft,
): Promise<Food | null> {
  const existing = await getOwnedFood(userId, foodId);
  if (!existing) return null;
  if (existing.source !== "custom") {
    throw new Error("Only user-created foods can be edited.");
  }
  return withTransaction((client) =>
    persistFoodDraft(
      client,
      userId,
      { ...draft, source: "custom", externalId: null },
      existing.isFavorite,
      foodId,
    ),
  );
}

export async function deleteFood(
  userId: string,
  foodId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM foods WHERE id = $1 AND user_id = $2 RETURNING id`,
    [foodId, userId],
  );
  return Boolean(row);
}

export async function setFoodFavorite(
  userId: string,
  foodId: string,
  favorite: boolean,
): Promise<boolean> {
  const row = await queryOne<{ is_favorite: boolean }>(
    `UPDATE foods SET is_favorite = $3
      WHERE id = $1 AND user_id = $2 RETURNING is_favorite`,
    [foodId, userId, favorite],
  );
  return Boolean(row?.is_favorite);
}

export async function saveExternalFoodAsFavorite(
  userId: string,
  input: FoodInput,
): Promise<Food> {
  const draft = foodInputToDraft(input);
  if (draft.source === "custom" || !draft.externalId) {
    throw new Error("Only sourced foods can be saved as external favorites.");
  }
  return withTransaction((client) =>
    persistFoodDraft(client, userId, draft, true),
  );
}

export function parseFoodSource(value: string | null): FoodSource | null {
  const result = foodSourceSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isSupportedBasis(value: string): boolean {
  return basisTypeSchema.safeParse(value).success;
}
