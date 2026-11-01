import { describe, expect, it } from "vitest";
import { suggestMacroFoods } from "@/lib/macroSuggestions";
import { EMPTY_NUTRIENTS, type Food, type Nutrients, type SavedMeal } from "@/lib/types";

function nutrients(partial: Partial<Nutrients>): Nutrients {
  return { ...EMPTY_NUTRIENTS, ...partial };
}

function food(
  id: string,
  name: string,
  partial: Partial<Nutrients>,
  basisType: Food["basisType"] = "100g",
): Food {
  return {
    id,
    source: "custom",
    externalId: null,
    barcode: null,
    name,
    brand: null,
    imageUrl: null,
    isFavorite: false,
    basisType,
    servingSize: null,
    servingUnit: null,
    nutrients: nutrients(partial),
    energySource: "provided",
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

const chicken = food("11111111-1111-1111-1111-111111111111", "Chicken breast", {
  kcal: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
});
const rice = food("22222222-2222-2222-2222-222222222222", "Cooked rice", {
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
});
const oliveOil = food("33333333-3333-3333-3333-333333333333", "Olive oil", {
  kcal: 884,
  protein: 0,
  carbs: 0,
  fat: 100,
});

const chickenRice: SavedMeal = {
  id: "44444444-4444-4444-4444-444444444444",
  name: "Chicken rice",
  finalWeightG: 500,
  servings: 2,
  items: [
    {
      id: "item-1",
      food: chicken,
      amount: 200,
      amountUnit: "g",
    },
    {
      id: "item-2",
      food: rice,
      amount: 150,
      amountUnit: "g",
    },
  ],
};

describe("macro suggestions", () => {
  it("ranks a protein food first when protein is the biggest gap", () => {
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 500, protein: 60, carbs: 10, fat: 10 },
      foods: [rice, chicken],
    });
    expect(suggestions[0]?.name).toBe("Chicken breast");
    expect(suggestions[0]?.protein).toBeGreaterThan(20);
    expect(suggestions[0]?.kcal).toBeLessThanOrEqual(500);
  });

  it("never suggests a portion that exceeds the remaining calories", () => {
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 100, protein: 30, carbs: null, fat: null },
      foods: [oliveOil, chicken],
    });
    expect(suggestions.some((item) => item.name === "Olive oil")).toBe(false);
    for (const item of suggestions) {
      expect(item.kcal ?? 0).toBeLessThanOrEqual(100);
    }
  });

  it("stays empty when nothing can fit the calorie budget", () => {
    expect(
      suggestMacroFoods({
        gaps: { kcal: 80, protein: 20, carbs: null, fat: null },
        foods: [oliveOil],
      }),
    ).toEqual([]);
  });

  it("does not treat an unknown macro as zero", () => {
    const unknown = food(
      "55555555-5555-5555-5555-555555555555",
      "Mystery snack",
      { kcal: 200 },
    );
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 400, protein: 40, carbs: null, fat: null },
      foods: [unknown],
    });
    expect(suggestions).toEqual([]);
  });

  it("uses favorites as a tie-break between equal foods", () => {
    const first = food(
      "66666666-6666-6666-6666-666666666666",
      "Yoghurt A",
      { kcal: 60, protein: 10, carbs: 4, fat: 0 },
    );
    const second = food(
      "88888888-8888-8888-8888-888888888888",
      "Yoghurt B",
      { kcal: 60, protein: 10, carbs: 4, fat: 0 },
    );
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 300, protein: 30, carbs: null, fat: null },
      foods: [first, second],
      favoriteIds: [second.id as string],
    });
    expect(suggestions[0]?.name).toBe("Yoghurt B");
  });

  it("suggests saved recipes using their per-100-g values", () => {
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 600, protein: 50, carbs: 60, fat: 20 },
      foods: [],
      recipes: [chickenRice],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.kind).toBe("recipe");
    expect(suggestions[0]?.id).toBe(chickenRice.id);
    expect(suggestions[0]?.kcal).not.toBeNull();
  });

  it("supports 100 ml foods with their native unit", () => {
    const milk = food(
      "77777777-7777-7777-7777-777777777777",
      "Milk",
      { kcal: 60, protein: 3.3, carbs: 4.8, fat: 3.2 },
      "100ml",
    );
    const suggestions = suggestMacroFoods({
      gaps: { kcal: 300, protein: 20, carbs: null, fat: null },
      foods: [milk],
    });
    expect(suggestions[0]?.unit).toBe("ml");
  });
});
