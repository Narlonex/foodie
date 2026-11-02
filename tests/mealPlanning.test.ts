import { describe, expect, it } from "vitest";
import {
  aggregateShoppingList,
  planNutrients,
  planPortion,
} from "@/lib/mealPlanning";
import {
  EMPTY_NUTRIENTS,
  type Food,
  type Nutrients,
  type SavedMeal,
} from "@/lib/types";

function food(overrides: Partial<Food> = {}): Food {
  return {
    source: "custom",
    externalId: null,
    barcode: null,
    name: "Chicken",
    brand: null,
    imageUrl: null,
    isFavorite: false,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: nutrients({ kcal: 100, protein: 20 }),
    energySource: "provided",
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
    ...overrides,
  };
}

function nutrients(overrides: Partial<Nutrients> = {}): Nutrients {
  return { ...EMPTY_NUTRIENTS, ...overrides };
}

function recipe(overrides: Partial<SavedMeal> = {}): SavedMeal {
  return {
    id: "recipe-1",
    name: "Chicken bowl",
    finalWeightG: 500,
    servings: 2,
    items: [
      {
        id: "item-1",
        food: food(),
        amount: 400,
        amountUnit: "g",
      },
      {
        id: "item-2",
        food: food({
          name: "Rice",
          nutrients: nutrients({ kcal: 130, carbs: 28 }),
        }),
        amount: 100,
        amountUnit: "g",
      },
    ],
    ...overrides,
  };
}

describe("planned recipe portions", () => {
  it("scales a recipe with a final weight by grams", () => {
    const result = planPortion(recipe(), 250);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portion.amountUnit).toBe("g");
    expect(result.portion.basisType).toBe("100g");
    expect(result.portion.nutrients.kcal).toBe(106);
    expect(result.portion.ingredients).toEqual([
      { name: "Chicken", amount: 200, unit: "g" },
      { name: "Rice", amount: 50, unit: "g" },
    ]);
  });

  it("falls back to servings when no final weight exists", () => {
    const result = planPortion(
      recipe({ finalWeightG: null, servings: 2 }),
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portion.amountUnit).toBe("serving");
    expect(result.portion.basisType).toBe("serving");
    expect(result.portion.servingSize).toBe(1);
    expect(result.portion.nutrients.kcal).toBe(265);
    expect(result.portion.ingredients[0]?.amount).toBe(200);
  });

  it("rejects a recipe without a weight or a serving count", () => {
    const result = planPortion(
      recipe({ finalWeightG: null, servings: null }),
      100,
    );
    expect(result).toEqual({ ok: false, error: "plan.needPortion" });
  });

  it("rejects invalid amounts", () => {
    expect(planPortion(recipe(), 0)).toEqual({
      ok: false,
      error: "plan.amountInvalid",
    });
    expect(planPortion(recipe(), Number.NaN)).toEqual({
      ok: false,
      error: "plan.amountInvalid",
    });
  });

  it("scales a stored plan snapshot to the planned amount", () => {
    const scaled = planNutrients({
      basisType: "100g",
      servingSize: null,
      nutrients: nutrients({ kcal: 106 }),
      amount: 250,
      amountUnit: "g",
    });
    expect(scaled.kcal).toBe(265);
  });
});

describe("shopping list aggregation", () => {
  it("sums ingredients and subtracts pantry stock in the same unit", () => {
    const list = aggregateShoppingList(
      [
        {
          ingredients: [
            { name: "Chicken", amount: 300, unit: "g" },
            { name: "Rice", amount: 100, unit: "g" },
          ],
        },
        {
          ingredients: [
            { name: "chicken", amount: 200, unit: "g" },
            { name: "Rice", amount: 100, unit: "g" },
          ],
        },
      ],
      [
        { name: "Chicken", nameKey: "chicken", quantity: 400, unit: "g" },
        { name: "Rice", nameKey: "rice", quantity: 50, unit: "g" },
      ],
    );
    expect(list).toEqual([
      { name: "Chicken", nameKey: "chicken", quantity: 100, unit: "g" },
      { name: "Rice", nameKey: "rice", quantity: 150, unit: "g" },
    ]);
  });

  it("does not convert pantry pieces into grams", () => {
    const list = aggregateShoppingList(
      [{ ingredients: [{ name: "Eggs", amount: 3, unit: "serving" }] }],
      [{ name: "Eggs", nameKey: "eggs", quantity: 6, unit: "pcs" }],
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.quantity).toBe(3);
  });

  it("drops ingredients fully covered by the pantry", () => {
    const list = aggregateShoppingList(
      [{ ingredients: [{ name: "Oats", amount: 100, unit: "g" }] }],
      [{ name: "Oats", nameKey: "oats", quantity: 500, unit: "g" }],
    );
    expect(list).toEqual([]);
  });
});
