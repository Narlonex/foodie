import { describe, expect, it } from "vitest";
import {
  displayKj,
  fromBaseAmount,
  normalizeNutrients,
  remainingTarget,
  resolveEnergy,
  scaleNutrients,
  toBaseAmount,
  totalNutrients,
} from "@/lib/nutrition";
import {
  EMPTY_NUTRIENTS,
  type DiaryEntry,
  type Nutrients,
} from "@/lib/types";

function nutrients(partial: Partial<Nutrients>): Nutrients {
  return { ...EMPTY_NUTRIENTS, ...partial };
}

function entry(partial: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: "entry-1",
    date: "2026-10-21",
    meal: "breakfast",
    foodId: null,
    source: "custom",
    barcode: null,
    name: "Test food",
    brand: null,
    imageUrl: null,
    amount: 100,
    amountUnit: "g",
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: nutrients({ kcal: 100 }),
    energySource: "provided",
    loggedAt: "2026-10-21T08:00:00.000Z",
    ...partial,
  };
}

describe("normalizeNutrients", () => {
  it("keeps unknown nutrients as null and preserves a genuine zero", () => {
    const result = normalizeNutrients({
      kcal: 0,
      protein: null,
      carbs: 12,
      fat: undefined,
    });
    expect(result.nutrients.kcal).toBe(0);
    expect(result.nutrients.protein).toBeNull();
    expect(result.nutrients.carbs).toBe(12);
    expect(result.nutrients.fat).toBeNull();
    expect(result.energySource).toBe("provided");
  });

  it("ignores negative and non-finite values instead of accepting them", () => {
    const result = normalizeNutrients({
      kcal: Number.NaN,
      protein: -4,
      carbs: Number.POSITIVE_INFINITY,
      fat: 3,
    });
    expect(result.nutrients.kcal).toBeNull();
    expect(result.nutrients.protein).toBeNull();
    expect(result.nutrients.carbs).toBeNull();
    expect(result.nutrients.fat).toBe(3);
  });
});

describe("energy resolution", () => {
  it("uses provided energy", () => {
    expect(resolveEnergy(nutrients({ kcal: 250, protein: 10 }))).toEqual({
      kcal: 250,
      energySource: "provided",
    });
  });

  it("derives energy with 4/4/9 only when all macros are known", () => {
        expect(
      resolveEnergy(nutrients({ protein: 10, carbs: 20, fat: 5 })),
    ).toEqual({ kcal: 165, energySource: "calculated" });
    expect(
      resolveEnergy(nutrients({ protein: 10, carbs: 20, fat: null })),
    ).toEqual({ kcal: null, energySource: "unknown" });
  });
});

describe("scaleNutrients", () => {
  it("scales a 100 g basis to a decimal gram amount", () => {
    const result = scaleNutrients(
      {
        basisType: "100g",
        servingSize: null,
        nutrients: nutrients({ kcal: 120, protein: 8, salt: 0.5 }),
        energySource: "provided",
      },
      150.5,
      "g",
    );
    expect(result.factor).toBeCloseTo(1.505, 6);
    expect(result.nutrients.kcal).toBeCloseTo(180.6, 4);
    expect(result.nutrients.protein).toBeCloseTo(12.04, 4);
    expect(result.nutrients.salt).toBeCloseTo(0.7525, 4);
  });

  it("scales a 100 ml basis and keeps missing values missing", () => {
    const result = scaleNutrients(
      {
        basisType: "100ml",
        servingSize: null,
        nutrients: nutrients({ kcal: 40, sugars: null, fiber: 0 }),
        energySource: "provided",
      },
      330,
      "ml",
    );
    expect(result.nutrients.kcal).toBeCloseTo(132, 4);
    expect(result.nutrients.sugars).toBeNull();
    expect(result.nutrients.fiber).toBe(0);
  });

  it("scales a serving basis by servings", () => {
    const result = scaleNutrients(
      {
        basisType: "serving",
        servingSize: 30,
        nutrients: nutrients({ kcal: 100, protein: 5 }),
        energySource: "provided",
      },
      1.5,
      "serving",
    );
    expect(result.factor).toBeCloseTo(0.05, 6);
    expect(result.nutrients.kcal).toBeCloseTo(5, 4);
    expect(result.nutrients.protein).toBeCloseTo(0.25, 4);
  });

  it("rejects a unit that does not match the basis", () => {
    expect(() =>
      scaleNutrients(
        {
          basisType: "100g",
          servingSize: null,
          nutrients: nutrients({ kcal: 100 }),
          energySource: "provided",
        },
        100,
        "ml",
      ),
    ).toThrow(/does not match/);
  });

  it("rejects zero, negative and non-finite amounts", () => {
    const food = {
      basisType: "100g" as const,
      servingSize: null,
      nutrients: nutrients({ kcal: 100 }),
      energySource: "provided" as const,
    };
    expect(() => scaleNutrients(food, 0, "g")).toThrow(/positive/);
    expect(() => scaleNutrients(food, -1, "g")).toThrow(/positive/);
    expect(() => scaleNutrients(food, Number.NaN, "g")).toThrow(/positive/);
  });

  it("requires a positive serving size for serving-based foods", () => {
    expect(() =>
      scaleNutrients(
        {
          basisType: "serving",
          servingSize: null,
          nutrients: nutrients({ kcal: 100 }),
          energySource: "provided",
        },
        1,
        "serving",
      ),
    ).toThrow(/serving size/);
  });
});

describe("unit conversion", () => {
  it("converts imperial input to stored grams and millilitres", () => {
    expect(toBaseAmount(1, "oz")).toEqual({ amount: 28.35, amountUnit: "g" });
    expect(toBaseAmount(1, "floz")).toEqual({
      amount: 29.574,
      amountUnit: "ml",
    });
    expect(toBaseAmount(250, "g")).toEqual({ amount: 250, amountUnit: "g" });
    expect(toBaseAmount(1.5, "serving")).toEqual({
      amount: 1.5,
      amountUnit: "serving",
    });
  });

  it("converts stored amounts for imperial display", () => {
    expect(fromBaseAmount(28.349523125, "g", "imperial")).toEqual({
      value: 1,
      unit: "oz",
    });
    expect(fromBaseAmount(250, "g", "imperial")).toEqual({
      value: 8.82,
      unit: "oz",
    });
    expect(fromBaseAmount(250, "g", "metric")).toEqual({
      value: 250,
      unit: "g",
    });
  });

  it("rejects invalid input amounts", () => {
    expect(() => toBaseAmount(0, "g")).toThrow(/positive/);
    expect(() => toBaseAmount(-2, "g")).toThrow(/positive/);
  });
});

describe("daily totals", () => {
  it("sums known values and counts missing entries without treating them as zero", () => {
    const totals = totalNutrients([
      entry({
        nutrients: nutrients({ kcal: 200, protein: 20, carbs: null }),
      }),
      entry({
        id: "entry-2",
        nutrients: nutrients({ kcal: 300, protein: null, carbs: 30 }),
      }),
    ]);
    expect(totals.entryCount).toBe(2);
    expect(totals.nutrients.kcal).toEqual({
      value: 500,
      knownEntries: 2,
      missingEntries: 0,
    });
    expect(totals.nutrients.protein).toEqual({
      value: 20,
      knownEntries: 1,
      missingEntries: 1,
    });
    expect(totals.nutrients.carbs).toEqual({
      value: 30,
      knownEntries: 1,
      missingEntries: 1,
    });
    expect(totals.nutrients.fiber).toEqual({
      value: null,
      knownEntries: 0,
      missingEntries: 2,
    });
  });

  it("keeps a genuine zero total known", () => {
    const totals = totalNutrients([
      entry({ nutrients: nutrients({ sugars: 0, protein: null }) }),
    ]);
    expect(totals.nutrients.sugars).toEqual({
      value: 0,
      knownEntries: 1,
      missingEntries: 0,
    });
    expect(totals.nutrients.protein.value).toBeNull();
  });

  it("tracks entries whose energy was calculated or unknown", () => {
    const totals = totalNutrients([
      entry({
        // Calculated energy is persisted as a numeric kcal value.
        nutrients: nutrients({ kcal: 140, protein: 10, carbs: 10, fat: 10 }),
        energySource: "calculated",
      }),
      entry({
        id: "entry-2",
        nutrients: nutrients({ kcal: null }),
        energySource: "unknown",
      }),
    ]);
    expect(totals.calculatedEnergyEntries).toBe(1);
    expect(totals.unknownEnergyEntries).toBe(1);
  });

  it("returns null totals for an empty day", () => {
    const totals = totalNutrients([]);
    expect(totals.entryCount).toBe(0);
    expect(totals.nutrients.kcal).toEqual({
      value: null,
      knownEntries: 0,
      missingEntries: 0,
    });
  });
});

describe("remaining targets", () => {
  it("returns a negative remainder when the target is exceeded", () => {
    expect(remainingTarget(2000, { value: 2150, knownEntries: 1, missingEntries: 0 })).toBe(-150);
  });

  it("returns null when either side is unknown", () => {
    expect(remainingTarget(null, { value: 100, knownEntries: 1, missingEntries: 0 })).toBeNull();
    expect(remainingTarget(2000, { value: null, knownEntries: 0, missingEntries: 1 })).toBeNull();
  });
});

describe("display energy", () => {
  it("converts kcal to kJ only when kJ is unknown", () => {
    expect(displayKj(1000, 239)).toEqual({ value: 1000, converted: false });
    expect(displayKj(null, 100)).toEqual({ value: 418, converted: true });
    expect(displayKj(null, null)).toEqual({ value: null, converted: false });
  });
});
