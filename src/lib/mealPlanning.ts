import { storageRound } from "./nutrition";
import { recipeNutrition } from "./recipes";
import {
  NUTRIENT_KEYS,
  type AmountUnit,
  type EnergySource,
  type Nutrients,
  type PlanIngredient,
  type PlanItem,
  type PantryItem,
  type SavedMeal,
  type ShoppingUnit,
} from "./types";

export interface PlanPortion {
  amountUnit: "g" | "serving";
  basisType: "100g" | "serving";
  servingSize: number | null;
  nutrients: Nutrients;
  energySource: EnergySource;
  ingredients: PlanIngredient[];
}

export type PlanPortionResult =
  | { ok: true; portion: PlanPortion }
  | { ok: false; error: "plan.needPortion" | "plan.amountInvalid" };

function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * A planned recipe keeps a per-basis snapshot. Recipes are planned by grams
 * when a final weight is known, otherwise by portions when a serving count is
 * known. Both paths scale the ingredient list for the shopping list.
 */
export function planPortion(meal: SavedMeal, amount: number): PlanPortionResult {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return { ok: false, error: "plan.amountInvalid" };
  }
  const summary = recipeNutrition(
    meal.items.map((item) => ({
      food: item.food,
      amount: item.amount,
      amountUnit: item.amountUnit,
    })),
    meal.finalWeightG,
    meal.servings,
  );

  let factor: number;
  let amountUnit: "g" | "serving";
  let basisType: "100g" | "serving";
  let servingSize: number | null;
  let nutrients: Nutrients | null;
  let energySource: EnergySource;

  if (summary.per100g && meal.finalWeightG && meal.finalWeightG > 0) {
    factor = amount / meal.finalWeightG;
    amountUnit = "g";
    basisType = "100g";
    servingSize = null;
    nutrients = summary.per100g;
    energySource = summary.energySource;
  } else if (summary.perServing && meal.servings && meal.servings > 0) {
    factor = amount / meal.servings;
    amountUnit = "serving";
    basisType = "serving";
    servingSize = 1;
    nutrients = summary.perServing;
    energySource = summary.energySource;
  } else {
    return { ok: false, error: "plan.needPortion" };
  }

  return {
    ok: true,
    portion: {
      amountUnit,
      basisType,
      servingSize,
      nutrients,
      energySource,
      ingredients: meal.items.map((item) => ({
        name: item.food.name,
        amount: roundAmount(item.amount * factor),
        unit: item.amountUnit,
      })),
    },
  };
}

/** Scales the stored per-basis snapshot to the planned amount. */
export function planNutrients(
  item: Pick<
    PlanItem,
    "basisType" | "servingSize" | "nutrients" | "amount" | "amountUnit"
  >,
): Nutrients {
  const basis =
    item.basisType === "100g"
      ? 100
      : item.servingSize && item.servingSize > 0
        ? item.servingSize
        : 1;
  const factor = item.amount / basis;
  const scaled = { ...item.nutrients };
  for (const key of NUTRIENT_KEYS) {
    const value = scaled[key];
    scaled[key] = value === null ? null : storageRound(value * factor);
  }
  return scaled;
}

export function shoppingNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ShoppingAggregate {
  name: string;
  nameKey: string;
  quantity: number;
  unit: ShoppingUnit;
}

function quantityToUnit(unit: AmountUnit | PantryItem["unit"]): ShoppingUnit {
  return unit;
}

/**
 * Aggregates the ingredients of every planned meal and subtracts what is
 * already in the pantry. Pantry quantities only offset the same unit; a
 * carton in the fridge is not converted into grams with a guessed density.
 */
export function aggregateShoppingList(
  planItems: ReadonlyArray<Pick<PlanItem, "ingredients">>,
  pantry: ReadonlyArray<Pick<PantryItem, "name" | "nameKey" | "quantity" | "unit">> = [],
): ShoppingAggregate[] {
  const wanted = new Map<
    string,
    { name: string; nameKey: string; quantity: number; unit: ShoppingUnit }
  >();

  for (const item of planItems) {
    for (const ingredient of item.ingredients) {
      if (!Number.isFinite(ingredient.amount) || ingredient.amount <= 0) continue;
      const nameKey = shoppingNameKey(ingredient.name);
      if (!nameKey) continue;
      const unit = quantityToUnit(ingredient.unit);
      const key = `${nameKey}\u0000${unit}`;
      const current = wanted.get(key);
      if (current) {
        current.quantity += ingredient.amount;
      } else {
        wanted.set(key, {
          name: ingredient.name.trim(),
          nameKey,
          quantity: ingredient.amount,
          unit,
        });
      }
    }
  }

  const stocked = new Map<string, number>();
  for (const item of pantry) {
    const key = `${item.nameKey}\u0000${item.unit}`;
    stocked.set(key, (stocked.get(key) ?? 0) + item.quantity);
  }

  return Array.from(wanted.entries())
    .map(([key, item]) => ({
      ...item,
      quantity: roundAmount(item.quantity - (stocked.get(key) ?? 0)),
    }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
