import { describe, expect, it } from "vitest";
import {
  customFoodSchema,
  dayTypeFormSchema,
  manualTargetsSchema,
  emailSchema,
  foodInputSchema,
  isoDateSchema,
  loginSchema,
  positiveAmountSchema,
  registerSchema,
} from "@/lib/validation";
import { EMPTY_NUTRIENTS } from "@/lib/types";

const validCustomFood = {
  name: "Skyr",
  brand: "",
  barcode: "",
  basisType: "100g" as const,
  servingSize: null,
  servingUnit: null,
  nutrients: { ...EMPTY_NUTRIENTS, kcal: 63, protein: 11 },
};

describe("custom food validation", () => {
  it("accepts a food with unknown optional nutrients", () => {
    const result = customFoodSchema.safeParse(validCustomFood);
    expect(result.success).toBe(true);
  });

  it("requires a name", () => {
    const result = customFoodSchema.safeParse({ ...validCustomFood, name: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.foodName");
    }
  });

  it("requires a serving size for a serving basis", () => {
    const result = customFoodSchema.safeParse({
      ...validCustomFood,
      basisType: "serving",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "servingSize")).toBe(true);
    }
  });

  it("rejects a serving size on a 100 g basis", () => {
    const result = customFoodSchema.safeParse({
      ...validCustomFood,
      servingSize: 30,
      servingUnit: "g",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed barcodes", () => {
    const result = customFoodSchema.safeParse({
      ...validCustomFood,
      barcode: "12ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative nutrients", () => {
    const result = customFoodSchema.safeParse({
      ...validCustomFood,
      nutrients: { ...validCustomFood.nutrients, protein: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("external food validation", () => {
  it("accepts a complete normalized record and a null barcode", () => {
    const result = foodInputSchema.safeParse({
      source: "off",
      externalId: "123456789",
      barcode: null,
      name: "Product",
      brand: null,
      basisType: "100ml",
      servingSize: null,
      servingUnit: null,
      nutrients: EMPTY_NUTRIENTS,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown source", () => {
    const result = foodInputSchema.safeParse({
      source: "other",
      externalId: null,
      barcode: null,
      name: "Product",
      brand: null,
      basisType: "100g",
      servingSize: null,
      servingUnit: null,
      nutrients: EMPTY_NUTRIENTS,
    });
    expect(result.success).toBe(false);
  });
});

describe("day type validation", () => {
  const valid = {
    name: "Workout Day",
    kcal: "2200",
    protein: "160",
    carbs: "220",
    fat: "80",
    adjustmentMode: "carbs",
    proteinPct: "30",
    carbsPct: "40",
    fatPct: "30",
  };

  it("coerces numeric form strings", () => {
    const result = dayTypeFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kcal).toBe(2200);
      expect(result.data.protein).toBe(160);
    }
  });

  it("rejects a non-positive calorie target", () => {
    const result = dayTypeFormSchema.safeParse({ ...valid, kcal: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative macro target", () => {
    const result = dayTypeFormSchema.safeParse({ ...valid, fat: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range percentage", () => {
    const result = dayTypeFormSchema.safeParse({ ...valid, carbsPct: "120" });
    expect(result.success).toBe(false);
  });

  it("rejects decimal-only garbage", () => {
    const result = dayTypeFormSchema.safeParse({ ...valid, kcal: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("manual nutrition targets", () => {
  it("accepts all four targets as form strings", () => {
    const result = manualTargetsSchema.safeParse({
      kcal: "2400",
      protein: "180.5",
      carbs: "250",
      fat: "80",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kcal: 2400,
        protein: 180.5,
        carbs: 250,
        fat: 80,
      });
    }
  });

  it("rejects missing, non-positive calories and out-of-range macros", () => {
    const valid = { kcal: "2000", protein: "150", carbs: "200", fat: "70" };
    expect(manualTargetsSchema.safeParse({ ...valid, kcal: "" }).success).toBe(false);
    expect(manualTargetsSchema.safeParse({ ...valid, kcal: "0" }).success).toBe(false);
    expect(manualTargetsSchema.safeParse({ ...valid, protein: "-1" }).success).toBe(false);
    expect(manualTargetsSchema.safeParse({ ...valid, fat: "1001" }).success).toBe(false);
  });
});

describe("account and date validation", () => {
  it("normalizes email addresses", () => {
    const result = emailSchema.safeParse("  Person@Example.COM ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("person@example.com");
  });

  it("rejects short passwords and invalid emails", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("requires eight characters and one uppercase letter", () => {
    const register = (password: string) =>
      registerSchema.safeParse({ email: "a@b.co", password }).success;
    expect(register("lowercase1")).toBe(false);
    expect(register("Abcdefg")).toBe(false);
    expect(register("Abcdefg1")).toBe(true);
  });

  it("accepts real ISO dates and rejects impossible ones", () => {
    expect(isoDateSchema.safeParse("2026-10-21").success).toBe(true);
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("21-10-2026").success).toBe(false);
  });

  it("accepts decimal amounts within range and rejects zero", () => {
    expect(positiveAmountSchema.safeParse(0.5).success).toBe(true);
    expect(positiveAmountSchema.safeParse(0).success).toBe(false);
    expect(positiveAmountSchema.safeParse(-3).success).toBe(false);
    expect(positiveAmountSchema.safeParse(100_001).success).toBe(false);
  });
});
