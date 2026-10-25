import { describe, expect, it } from "vitest";
import {
  FoodApiError,
  missingNutrientKeys,
  normalizeOffProduct,
  normalizeOffSearchHit,
} from "@/lib/foods/openFoodFacts";
import { normalizeUsdaFood } from "@/lib/foods/usda";

const v2Product = {
  code: "8580000000001",
  product_name: "Jogurt skyr",
  product_name_sk: "Skyr jahoda",
  brands: "Test Brand",
  quantity: "150 g",
  nutrition: {
    input_sets: [
      {
        per: "100g",
        per_quantity: 100,
        per_unit: "g",
        source: "packaging",
        nutrients: {
          "energy-kcal": { value: 63 },
          "energy-kj": { value: 264 },
          proteins: { value: 11 },
          carbohydrates: { value: 4 },
          sugars: { value: 4 },
          fat: { value: 0.2 },
          "saturated-fat": { value: 0.1 },
          fiber: { value: 0 },
          salt: { value: 0.1 },
        },
      },
    ],
  },
};

describe("Open Food Facts product normalization", () => {
  it("normalizes a per-100 g product and prefers the Slovak name", () => {
    const result = normalizeOffProduct(v2Product);
    expect(result).toMatchObject({
      source: "off",
      externalId: "8580000000001",
      barcode: "8580000000001",
      name: "Skyr jahoda",
      brand: "Test Brand",
      basisType: "100g",
      servingSize: null,
      energySource: "provided",
    });
    expect(result.nutrients.kcal).toBe(63);
    expect(result.nutrients.kj).toBe(264);
    expect(result.nutrients.protein).toBe(11);
    expect(result.nutrients.fiber).toBe(0);
    expect(result.nutrients.salt).toBe(0.1);
  });

  it("normalizes a per-100 ml product from its quantity", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      quantity: "1 l",
      nutrition: {
        input_sets: [
          {
            per: "100ml",
            per_quantity: 100,
            per_unit: "ml",
            source: "manufacturer",
            nutrients: { "energy-kcal": { value: 42 } },
          },
        ],
      },
    });
    expect(result.basisType).toBe("100ml");
    expect(result.nutrients.kcal).toBe(42);
    expect(result.nutrients.protein).toBeNull();
    expect(result.nutrients.carbs).toBeNull();
  });

  it("keeps a serving basis and its serving size", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      nutrition: {
        input_sets: [
          {
            per: "serving",
            per_quantity: 30,
            per_unit: "g",
            source: "packaging",
            nutrients: { "energy-kcal": { value: 120 }, proteins: { value: 6 } },
          },
        ],
      },
    });
    expect(result.basisType).toBe("serving");
    expect(result.servingSize).toBe(30);
    expect(result.servingUnit).toBe("g");
    expect(result.nutrients.kcal).toBe(120);
  });

  it("leaves missing nutrients unknown instead of zero", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      nutrition: {
        input_sets: [
          {
            per: "100g",
            per_quantity: 100,
            per_unit: "g",
            nutrients: { proteins: { value: 5 } },
          },
        ],
      },
    });
    expect(result.nutrients.protein).toBe(5);
    expect(result.nutrients.kcal).toBeNull();
    expect(result.nutrients.sugars).toBeNull();
    expect(result.nutrients.salt).toBeNull();
    expect(result.energySource).toBe("unknown");
    expect(missingNutrientKeys(result.nutrients)).toContain("kcal");
  });

  it("derives energy from macros when kcal is absent and marks it calculated", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      nutrition: {
        input_sets: [
          {
            per: "100g",
            per_quantity: 100,
            per_unit: "g",
            nutrients: {
              proteins: { value: 11 },
              carbohydrates: { value: 4 },
              fat: { value: 0.2 },
            },
          },
        ],
      },
    });
    expect(result.nutrients.kcal).toBeCloseTo(61.8, 3);
    expect(result.energySource).toBe("calculated");
  });

  it("marks kJ-derived energy as calculated", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      nutrition: {
        input_sets: [
          {
            per: "100g",
            per_quantity: 100,
            per_unit: "g",
            nutrients: { "energy-kj": { value: 1000 } },
          },
        ],
      },
    });
    expect(result.nutrients.kj).toBe(1000);
    expect(result.nutrients.kcal).toBeCloseTo(239.0057, 3);
    expect(result.energySource).toBe("calculated");
  });

  it("ignores estimated nutrient entries", () => {
    const result = normalizeOffProduct({
      ...v2Product,
      nutrition: {
        input_sets: [
          {
            per: "100g",
            per_quantity: 100,
            per_unit: "g",
            source: "packaging",
            nutrients: {
              "energy-kcal": { value: 40, modifier: "~", source: "estimate" },
              proteins: { value: 5 },
            },
          },
        ],
      },
    });
    expect(result.nutrients.kcal).toBeNull();
    expect(result.nutrients.protein).toBe(5);
  });

  it("falls back to legacy flat nutriments per 100 g", () => {
    const result = normalizeOffProduct({
      code: "111111",
      product_name: "Legacy cereal",
      brands: "Old brand",
      quantity: "500 g",
      nutriments: {
        "energy-kcal_100g": 380,
        "proteins_100g": 8,
        "carbohydrates_100g": 70,
      },
    });
    expect(result.basisType).toBe("100g");
    expect(result.nutrients.kcal).toBe(380);
    expect(result.nutrients.protein).toBe(8);
    expect(result.nutrients.fat).toBeNull();
  });

  it("rejects products without a name", () => {
    expect(() => normalizeOffProduct({ code: "123" })).toThrowError(
      expect.objectContaining({ kind: "invalid" }),
    );
  });

  it("rejects products without nutrition data", () => {
    expect(() =>
      normalizeOffProduct({
        code: "123",
        product_name: "Empty record",
        nutrition: { input_sets: [] },
      }),
    ).toThrowError(expect.objectContaining({ kind: "no-data" }));
  });

  it("rejects unsuffixed legacy nutrient values rather than mis-scaling them", () => {
    expect(() =>
      normalizeOffProduct({
        code: "123",
        product_name: "Ambiguous basis",
        nutriments: { "energy-kcal": 200, proteins: 4 },
      }),
    ).toThrowError(expect.objectContaining({ kind: "no-data" }));
  });
});

describe("Open Food Facts search normalization", () => {
  it("normalizes a search hit with per-100 g nutrients", () => {
    const result = normalizeOffSearchHit({
      code: "999",
      product_name: "Granola",
      brands: "Brand",
      quantity: "400 g",
      nutriments: {
        "energy-kcal_100g": 450,
        "proteins_100g": 9,
        "carbohydrates_100g": 60,
      },
    });
    expect(result?.basisType).toBe("100g");
    expect(result?.nutrients.kcal).toBe(450);
    expect(result?.nutrients.fat).toBeNull();
  });

  it("detects a liquid basis from the package quantity", () => {
    const result = normalizeOffSearchHit({
      code: "999",
      product_name: "Juice",
      quantity: "1 l",
      nutriments: { "energy-kcal_100g": 45 },
    });
    expect(result?.basisType).toBe("100ml");
  });

  it("drops hits without a name, nutrition, or usable values", () => {
    expect(
      normalizeOffSearchHit({ code: "1", nutriments: { "proteins_100g": 1 } }),
    ).toBeNull();
    expect(
      normalizeOffSearchHit({ code: "2", product_name: "No data" }),
    ).toBeNull();
    expect(
      normalizeOffSearchHit({
        code: "3",
        product_name: "Ambiguous",
        nutriments: { "proteins_100g": 1, proteins: 99 },
      })?.nutrients.protein,
    ).toBe(1);
    expect(
      normalizeOffSearchHit({
        code: "4",
        product_name: "Empty",
        nutriments: {},
      }),
    ).toBeNull();
  });
});

describe("Food API errors", () => {
  it("carries a machine-readable error kind", () => {
    const error = new FoodApiError("rate-limited", "slow down");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("rate-limited");
    expect(error.message).toBe("slow down");
  });
});

describe("USDA FoodData Central normalization", () => {
  it("normalizes nutrient IDs into the internal model", () => {
    const result = normalizeUsdaFood({
      fdcId: 12345,
      description: "Chicken breast, raw",
      dataType: "Foundation",
      foodNutrients: [
        { nutrientId: 1008, value: 165 },
        { nutrientId: 1003, value: 31 },
        { nutrientId: 1005, value: 0 },
        { nutrientId: 1004, value: 3.6 },
        { nutrientId: 1079, value: 0 },
      ],
    });
    expect(result).toMatchObject({
      source: "usda",
      externalId: "12345",
      name: "Chicken breast, raw",
      basisType: "100g",
      energySource: "provided",
    });
    expect(result?.nutrients.protein).toBe(31);
    expect(result?.nutrients.carbs).toBe(0);
    expect(result?.nutrients.salt).toBeNull();
    expect(result?.nutrients.sugars).toBeNull();
  });

  it("converts kJ-only energy and marks it calculated", () => {
    const result = normalizeUsdaFood({
      fdcId: 7,
      description: "Food",
      foodNutrients: [{ nutrientId: 1062, value: 418.4 }],
    });
    expect(result?.nutrients.kcal).toBeCloseTo(100, 3);
    expect(result?.nutrients.kj).toBe(418.4);
    expect(result?.energySource).toBe("calculated");
  });

  it("returns null for records without an id or description", () => {
    expect(normalizeUsdaFood({ description: "No id" })).toBeNull();
    expect(normalizeUsdaFood({ fdcId: 1 })).toBeNull();
  });

  it("uses Atwater energy factors when Foundation foods omit energy 1008", () => {
    const result = normalizeUsdaFood({
      fdcId: 746782,
      description: "Chicken, breast, boneless, skinless, raw",
      dataType: "Foundation",
      foodNutrients: [
        { nutrientId: 2047, value: 106 },
        { nutrientId: 1003, value: 22.5 },
        { nutrientId: 1005, value: 0 },
        { nutrientId: 1004, value: 1.93 },
      ],
    });
    expect(result?.nutrients.kcal).toBe(106);
    expect(result?.energySource).toBe("provided");
    expect(result?.nutrients.protein).toBe(22.5);
  });

  it("drops hits that carry no energy or macro nutrients", () => {
    expect(
      normalizeUsdaFood({
        fdcId: 2759004,
        description: "Lunchmeat, chicken breast, sliced",
        foodNutrients: [
          { nutrientId: 1258, value: 0.703 },
          { nutrientId: 1166, value: 0.213 },
        ],
      }),
    ).toBeNull();
  });
});
