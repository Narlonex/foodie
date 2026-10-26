import { describe, expect, it } from "vitest";
import { gramsForServings, recipeNutrition } from "@/lib/recipes";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/lib/types";

function nutrients(partial: Partial<Nutrients>): Nutrients {
  return { ...EMPTY_NUTRIENTS, ...partial };
}

const chicken = {
  basisType: "100g" as const,
  servingSize: null,
  servingUnit: null,
  nutrients: nutrients({
    kcal: 120,
    protein: 23,
    carbs: 0,
    fat: 2,
    sugars: 0,
    satFat: 0.6,
    fiber: 0,
    salt: 0.2,
  }),
  energySource: "provided" as const,
};

const rice = {
  basisType: "100g" as const,
  servingSize: null,
  servingUnit: null,
  nutrients: nutrients({
    kcal: 350,
    protein: 7,
    carbs: 78,
    fat: 1,
    sugars: 0.1,
    satFat: 0.2,
    fiber: 1.3,
    salt: 0.01,
  }),
  energySource: "provided" as const,
};

describe("recipeNutrition", () => {
  it("sums ingredients at their entered amounts", () => {
    const summary = recipeNutrition(
      [
        { food: chicken, amount: 200, amountUnit: "g" },
        { food: rice, amount: 100, amountUnit: "g" },
      ],
      500,
      2,
    );

    expect(summary.batch.nutrients.kcal.value).toBe(590);
    expect(summary.batch.nutrients.protein.value).toBe(53);
    expect(summary.ingredientGrams).toBe(300);
  });

  it("computes per-100-g values from the final weight", () => {
    const summary = recipeNutrition(
      [
        { food: chicken, amount: 200, amountUnit: "g" },
        { food: rice, amount: 100, amountUnit: "g" },
      ],
      500,
      null,
    );

    expect(summary.per100g?.kcal).toBe(118);
    expect(summary.per100g?.protein).toBe(10.6);
    expect(summary.perServing).toBeNull();
  });

  it("computes per-serving values and the nominal serving weight", () => {
    const summary = recipeNutrition(
      [{ food: chicken, amount: 300, amountUnit: "g" }],
      450,
      3,
    );

    expect(summary.perServing?.kcal).toBe(120);
    expect(summary.servingWeightGrams).toBe(150);
  });

  it("does not invent per-100-g values without a final weight", () => {
    const summary = recipeNutrition(
      [{ food: chicken, amount: 300, amountUnit: "g" }],
      null,
      3,
    );

    expect(summary.per100g).toBeNull();
    expect(summary.perServing?.kcal).toBe(120);
  });

  it("keeps unknown nutrients unknown instead of counting them as zero", () => {
    const partial = {
      ...chicken,
      nutrients: nutrients({ kcal: 120, protein: 23 }),
    };
    const summary = recipeNutrition(
      [{ food: partial, amount: 100, amountUnit: "g" }],
      100,
      1,
    );

    expect(summary.batch.nutrients.kcal.value).toBe(120);
    expect(summary.batch.nutrients.fiber.value).toBeNull();
    expect(summary.per100g?.fiber).toBeNull();
    expect(summary.incomplete).toBe(true);
  });

  it("marks a fully known recipe as complete", () => {
    const summary = recipeNutrition(
      [{ food: rice, amount: 100, amountUnit: "g" }],
      100,
      1,
    );

    expect(summary.incomplete).toBe(false);
  });
});

describe("gramsForServings", () => {
  it("converts servings to grams through the nominal weight", () => {
    expect(gramsForServings(150, 1.5)).toBe(225);
  });

  it("returns null when the serving weight is unknown", () => {
    expect(gramsForServings(null, 2)).toBeNull();
    expect(gramsForServings(150, 0)).toBeNull();
  });
});
