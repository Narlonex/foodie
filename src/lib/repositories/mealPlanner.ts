import "server-only";
import { query, queryOne, withTransaction } from "../db";
import { aggregateShoppingList, planPortion } from "../mealPlanning";
import { insertEntryWithFood } from "./diary";
import { getSavedMeal } from "./savedMeals";
import type {
  AmountUnit,
  BasisType,
  Food,
  Meal,
  Nutrients,
  PantryItem,
  PantryUnit,
  PlanIngredient,
  PlanItem,
  ShoppingItem,
  ShoppingUnit,
} from "../types";

interface PlanRow {
  id: string;
  plan_date: string | Date;
  meal: Meal;
  saved_meal_id: string | null;
  name: string;
  amount: string | number;
  amount_unit: "g" | "serving";
  basis_type: "100g" | "serving";
  serving_size: string | number | null;
  nutrients: Nutrients;
  ingredients: PlanIngredient[];
  logged_at: string | Date | null;
}

interface ShoppingRow {
  id: string;
  name: string;
  quantity: string | number | null;
  unit: ShoppingUnit;
  checked: boolean;
  source: "manual" | "plan";
}

interface PantryRow {
  id: string;
  name: string;
  name_key: string;
  quantity: string | number;
  unit: PantryUnit;
  expires_on: string | Date | null;
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** pg parses `date` into a local Date; keep the calendar day, not the UTC shift. */
function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

function mapPlan(row: PlanRow): PlanItem {
  return {
    id: row.id,
    date: dateOnly(row.plan_date) ?? "",
    meal: row.meal,
    savedMealId: row.saved_meal_id,
    name: row.name,
    amount: Number(row.amount),
    amountUnit: row.amount_unit,
    basisType: row.basis_type,
    servingSize: numberOrNull(row.serving_size),
    nutrients: row.nutrients,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    loggedAt: row.logged_at
      ? new Date(row.logged_at).toISOString()
      : null,
  };
}

function mapShopping(row: ShoppingRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: numberOrNull(row.quantity),
    unit: row.unit,
    checked: row.checked,
    source: row.source,
  };
}

function mapPantry(row: PantryRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    quantity: Number(row.quantity),
    unit: row.unit,
    expiresOn: dateOnly(row.expires_on),
  };
}

export async function listPlanItems(
  userId: string,
  from: string,
  to: string,
): Promise<PlanItem[]> {
  const rows = await query<PlanRow>(
    `SELECT id, plan_date, meal, saved_meal_id, name, amount, amount_unit,
            basis_type, serving_size, nutrients, ingredients, logged_at
       FROM meal_plan_items
      WHERE user_id = $1 AND plan_date BETWEEN $2 AND $3
      ORDER BY plan_date,
               CASE meal
                 WHEN 'breakfast' THEN 1
                 WHEN 'lunch' THEN 2
                 WHEN 'dinner' THEN 3
                 ELSE 4
               END,
               created_at`,
    [userId, from, to],
  );
  return rows.map(mapPlan);
}

export async function addPlanItem(
  userId: string,
  input: { date: string; meal: Meal; savedMealId: string; amount: number },
): Promise<string> {
  const meal = await getSavedMeal(userId, input.savedMealId);
  if (!meal) throw new Error("Recipe not found.");
  const result = planPortion(meal, input.amount);
  if (!result.ok) throw new Error(result.error);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO meal_plan_items
       (user_id, plan_date, meal, saved_meal_id, name, amount, amount_unit,
        basis_type, serving_size, nutrients, ingredients)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
     RETURNING id`,
    [
      userId,
      input.date,
      input.meal,
      input.savedMealId,
      meal.name,
      input.amount,
      result.portion.amountUnit,
      result.portion.basisType,
      result.portion.servingSize,
      JSON.stringify(result.portion.nutrients),
      JSON.stringify(result.portion.ingredients),
    ],
  );
  if (!row) throw new Error("Failed to add the planned meal.");
  return row.id;
}

export async function deletePlanItem(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM meal_plan_items
      WHERE id = $1 AND user_id = $2 AND logged_at IS NULL
      RETURNING id`,
    [id, userId],
  );
  return Boolean(row);
}

export async function logPlannedMeal(
  userId: string,
  date: string,
  meal: Meal,
): Promise<number> {
  return withTransaction(async (client) => {
    const result = await client.query<PlanRow>(
      `SELECT id, plan_date, meal, saved_meal_id, name, amount, amount_unit,
              basis_type, serving_size, nutrients, ingredients, logged_at
         FROM meal_plan_items
        WHERE user_id = $1 AND plan_date = $2 AND meal = $3
          AND logged_at IS NULL
        ORDER BY created_at
        FOR UPDATE`,
      [userId, date, meal],
    );

    for (const row of result.rows) {
      const nutrients = row.nutrients;
      const food: Food = {
        source: "custom",
        externalId: null,
        barcode: null,
        name: row.name.slice(0, 200),
        brand: null,
        imageUrl: null,
        isFavorite: false,
        basisType: row.basis_type as BasisType,
        servingSize: numberOrNull(row.serving_size),
        servingUnit: null,
        nutrients,
        energySource: "calculated",
        preparation: "unspecified",
        packageQuantity: null,
        packageUnit: null,
        drainedWeight: null,
      };
      await insertEntryWithFood(
        client,
        userId,
        food,
        date,
        meal,
        Number(row.amount),
        row.amount_unit as AmountUnit,
      );
    }

    const ids = result.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE meal_plan_items
            SET logged_at = now()
          WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, ids],
      );
    }
    return ids.length;
  });
}

export async function listShoppingItems(userId: string): Promise<ShoppingItem[]> {
  const rows = await query<ShoppingRow>(
    `SELECT id, name, quantity, unit, checked, source
       FROM shopping_list_items
      WHERE user_id = $1
      ORDER BY checked, lower(name)`,
    [userId],
  );
  return rows.map(mapShopping);
}

export async function addShoppingItem(
  userId: string,
  input: { name: string; quantity: number; unit: ShoppingUnit },
): Promise<void> {
  const nameKey = input.name.trim().toLowerCase().replace(/\s+/g, " ");
  await query(
    `INSERT INTO shopping_list_items
       (user_id, name, name_key, quantity, unit, source)
     VALUES ($1, $2, $3, $4, $5, 'manual')
     ON CONFLICT (user_id, name_key, unit)
     DO UPDATE SET
       quantity = COALESCE(shopping_list_items.quantity, 0) + EXCLUDED.quantity,
       name = EXCLUDED.name,
       updated_at = now()`,
    [userId, input.name.trim(), nameKey, input.quantity, input.unit],
  );
}

export async function generateShoppingList(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const [plan, pantry, existing] = await Promise.all([
    listPlanItems(userId, from, to),
    listPantryItems(userId),
    query<ShoppingRow>(
      `SELECT id, name, quantity, unit, checked, source
         FROM shopping_list_items
        WHERE user_id = $1 AND source = 'plan'`,
      [userId],
    ),
  ]);
  const desired = aggregateShoppingList(plan, pantry);
  const desiredKeys = new Set(desired.map((item) => `${item.nameKey}\u0000${item.unit}`));

  await withTransaction(async (client) => {
    for (const item of desired) {
      await client.query(
        `INSERT INTO shopping_list_items
           (user_id, name, name_key, quantity, unit, source)
         VALUES ($1, $2, $3, $4, $5, 'plan')
         ON CONFLICT (user_id, name_key, unit)
         DO UPDATE SET
           quantity = EXCLUDED.quantity,
           source = 'plan',
           updated_at = now()
         WHERE shopping_list_items.source = 'plan'`,
        [userId, item.name, item.nameKey, item.quantity, item.unit],
      );
    }
    for (const row of existing) {
      const key = `${row.name.trim().toLowerCase().replace(/\s+/g, " ")}\u0000${row.unit}`;
      if (!desiredKeys.has(key) && !row.checked) {
        await client.query(
          `DELETE FROM shopping_list_items WHERE id = $1 AND user_id = $2`,
          [row.id, userId],
        );
      }
    }
  });
  return desired.length;
}

export async function toggleShoppingItem(
  userId: string,
  id: string,
  checked: boolean,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE shopping_list_items
        SET checked = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, checked],
  );
  return Boolean(row);
}

export async function deleteShoppingItem(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM shopping_list_items
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  return Boolean(row);
}

export async function clearCheckedShoppingItems(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM shopping_list_items
      WHERE user_id = $1 AND checked = true
      RETURNING id`,
    [userId],
  );
  return rows.length;
}

export async function listPantryItems(userId: string): Promise<PantryItem[]> {
  const rows = await query<PantryRow>(
    `SELECT id, name, name_key, quantity, unit, expires_on
       FROM pantry_items
      WHERE user_id = $1
      ORDER BY expires_on NULLS LAST, lower(name)`,
    [userId],
  );
  return rows.map(mapPantry);
}

export async function addPantryItem(
  userId: string,
  input: {
    name: string;
    quantity: number;
    unit: PantryUnit;
    expiresOn: string | null;
  },
): Promise<void> {
  const nameKey = input.name.trim().toLowerCase().replace(/\s+/g, " ");
  await query(
    `INSERT INTO pantry_items
       (user_id, name, name_key, quantity, unit, expires_on)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      input.name.trim(),
      nameKey,
      input.quantity,
      input.unit,
      input.expiresOn,
    ],
  );
}

export async function deletePantryItem(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM pantry_items WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return Boolean(row);
}
