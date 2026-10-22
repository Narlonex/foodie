import "server-only";
import type { Pool, PoolClient } from "pg";
import { getPool, query, queryOne, withTransaction } from "../db";
import type { AmountUnit, DiaryEntry, Food, Meal, SavedMeal, SavedMealItem } from "../types";
import { mapFood, type FoodRow } from "./mappers";
import { insertEntryWithFood } from "./diary";

const ITEM_FOOD_COLUMNS = `
  f.id, f.source, f.external_id, f.barcode, f.name, f.brand, f.basis_type,
  f.serving_size, f.serving_unit, f.kcal, f.kj, f.protein_g, f.carbs_g,
  f.sugars_g, f.fat_g, f.sat_fat_g, f.fiber_g, f.salt_g, f.energy_source,
  f.is_favorite
`;

interface ItemRow extends FoodRow {
  item_id: string;
  saved_meal_id: string;
  amount: string;
  amount_unit: AmountUnit;
  sort_order: number;
}

export interface SavedMealInputItem {
  foodId: string;
  amount: number;
  amountUnit: AmountUnit;
}

function mapItems(rows: ItemRow[]): SavedMealItem[] {
  return rows.map((row) => ({
    id: row.item_id,
    food: mapFood(row),
    amount: Number(row.amount),
    amountUnit: row.amount_unit,
  }));
}

async function loadItems(
  runner: Pick<Pool, "query">,
  userId: string,
  mealIds: string[],
): Promise<Map<string, SavedMealItem[]>> {
  const result = await runner.query<ItemRow>(
    `SELECT smi.id AS item_id, smi.saved_meal_id, smi.amount, smi.amount_unit,
            smi.sort_order, ${ITEM_FOOD_COLUMNS}
       FROM saved_meal_items smi
       JOIN saved_meals sm ON sm.id = smi.saved_meal_id AND sm.user_id = $1
       JOIN foods f ON f.id = smi.food_id AND f.user_id = $1
      WHERE smi.saved_meal_id = ANY($2::uuid[])
      ORDER BY smi.sort_order, smi.created_at`,
    [userId, mealIds],
  );
  const map = new Map<string, SavedMealItem[]>();
  for (const row of result.rows) {
    const list = map.get(row.saved_meal_id) ?? [];
    list.push(...mapItems([row]));
    map.set(row.saved_meal_id, list);
  }
  return map;
}

export async function listSavedMeals(userId: string): Promise<SavedMeal[]> {
  const meals = await query<{ id: string; name: string }>(
    `SELECT id, name FROM saved_meals WHERE user_id = $1 ORDER BY lower(name)`,
    [userId],
  );
  if (meals.length === 0) return [];
  const items = await loadItems(
    getPool(),
    userId,
    meals.map((meal) => meal.id),
  );
  return meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    items: items.get(meal.id) ?? [],
  }));
}

export async function getSavedMeal(
  userId: string,
  savedMealId: string,
): Promise<SavedMeal | null> {
  const meal = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM saved_meals WHERE id = $1 AND user_id = $2`,
    [savedMealId, userId],
  );
  if (!meal) return null;
  const items = await loadItems(getPool(), userId, [meal.id]);
  return { id: meal.id, name: meal.name, items: items.get(meal.id) ?? [] };
}

function assertUniqueFoods(items: SavedMealInputItem[]): void {
  const ids = new Set(items.map((item) => item.foodId));
  if (ids.size !== items.length) {
    throw new Error("A saved meal cannot list the same food twice.");
  }
}

async function insertItems(
  client: PoolClient,
  userId: string,
  savedMealId: string,
  items: SavedMealInputItem[],
): Promise<void> {
  for (const [index, item] of items.entries()) {
    const food = await client.query<FoodRow>(
      `SELECT id, source, external_id, barcode, name, brand, basis_type,
              serving_size, serving_unit, kcal, kj, protein_g, carbs_g, sugars_g,
              fat_g, sat_fat_g, fiber_g, salt_g, energy_source, is_favorite
         FROM foods WHERE id = $1 AND user_id = $2`,
      [item.foodId, userId],
    );
    const row = food.rows[0];
    if (!row) throw new Error("One of the selected foods no longer exists.");
    const map = mapFood(row);
    const expected =
      map.basisType === "100g" ? "g" : map.basisType === "100ml" ? "ml" : "serving";
    if (item.amountUnit !== expected) {
      throw new Error("An item's amount unit does not match its food basis.");
    }
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error("Amounts must be positive.");
    }
    await client.query(
      `INSERT INTO saved_meal_items
        (saved_meal_id, food_id, amount, amount_unit, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [savedMealId, item.foodId, item.amount, item.amountUnit, index],
    );
  }
}

export async function createSavedMeal(
  userId: string,
  name: string,
  items: SavedMealInputItem[],
): Promise<string> {
  if (items.length === 0) throw new Error("A saved meal needs at least one food.");
  assertUniqueFoods(items);
  return withTransaction(async (client) => {
    const meal = await client.query<{ id: string }>(
      `INSERT INTO saved_meals (user_id, name) VALUES ($1, $2) RETURNING id`,
      [userId, name],
    );
    const id = meal.rows[0]?.id;
    if (!id) throw new Error("Failed to create the saved meal.");
    await insertItems(client, userId, id, items);
    return id;
  });
}

export async function updateSavedMeal(
  userId: string,
  savedMealId: string,
  name: string,
  items: SavedMealInputItem[],
): Promise<boolean> {
  if (items.length === 0) throw new Error("A saved meal needs at least one food.");
  assertUniqueFoods(items);
  return withTransaction(async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE saved_meals SET name = $3
        WHERE id = $1 AND user_id = $2 RETURNING id`,
      [savedMealId, userId, name],
    );
    if (!updated.rows[0]) return false;
    await client.query(`DELETE FROM saved_meal_items WHERE saved_meal_id = $1`, [
      savedMealId,
    ]);
    await insertItems(client, userId, savedMealId, items);
    return true;
  });
}

export async function deleteSavedMeal(
  userId: string,
  savedMealId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM saved_meals WHERE id = $1 AND user_id = $2 RETURNING id`,
    [savedMealId, userId],
  );
  return Boolean(row);
}

export async function addSavedMealToDiary(
  userId: string,
  savedMealId: string,
  date: string,
  meal: Meal,
): Promise<{ entries: DiaryEntry[] }> {
  return withTransaction(async (client) => {
    const saved = await client.query<{ id: string }>(
      `SELECT id FROM saved_meals WHERE id = $1 AND user_id = $2`,
      [savedMealId, userId],
    );
    if (!saved.rows[0]) throw new Error("Saved meal not found.");

    const items = await client.query<ItemRow>(
      `SELECT smi.id AS item_id, smi.saved_meal_id, smi.amount, smi.amount_unit,
              smi.sort_order, ${ITEM_FOOD_COLUMNS}
         FROM saved_meal_items smi
         JOIN foods f ON f.id = smi.food_id AND f.user_id = $1
        WHERE smi.saved_meal_id = $2
        ORDER BY smi.sort_order, smi.created_at`,
      [userId, savedMealId],
    );
    if (items.rows.length === 0) {
      throw new Error("This saved meal has no available foods.");
    }

    const entries: DiaryEntry[] = [];
    for (const row of items.rows) {
      const food: Food = mapFood(row);
      const entry = await insertEntryWithFood(
        client,
        userId,
        food,
        date,
        meal,
        Number(row.amount),
        row.amount_unit,
      );
      entries.push(entry);
    }
    return { entries };
  });
}
