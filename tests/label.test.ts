import { describe, expect, it } from "vitest";
import { parseNutritionLabel } from "@/lib/label";

describe("nutrition label parser", () => {
  it("reads a Slovak label with a per-100-g basis", () => {
    const result = parseNutritionLabel(`
      Výživové údaje na 100 g
      Energetická hodnota 1234 kJ / 295 kcal
      Tuky 12 g
      z toho nasýtené mastné kyseliny 3,2 g
      Sacharidy 40 g
      z toho cukry 8,5 g
      Vláknina 5 g
      Bielkoviny 7,5 g
      Soľ 1,2 g
      Hmotnosť 150 g
    `);

    expect(result.basisType).toBe("100g");
    expect(result.nutrients).toMatchObject({
      kcal: 295,
      kj: 1234,
      protein: 7.5,
      carbs: 40,
      sugars: 8.5,
      fat: 12,
      satFat: 3.2,
      fiber: 5,
      salt: 1.2,
    });
    expect(result.packageQuantity).toBe(150);
    expect(result.packageUnit).toBe("g");
    expect(result.matchedKeys).toHaveLength(9);
  });

  it("reads an English per-100-ml label and keeps the package size", () => {
    const result = parseNutritionLabel(`
      Typical values per 100 ml
      Energy 200 kJ / 48 kcal
      Fat 1.5 g
      of which saturates 0.4 g
      Carbohydrate 5 g
      of which sugars 4.8 g
      Fibre 0.2 g
      Protein 3.1 g
      Salt 0.1 g
      Net content 330 ml
    `);

    expect(result.basisType).toBe("100ml");
    expect(result.nutrients.kcal).toBe(48);
    expect(result.nutrients.protein).toBe(3.1);
    expect(result.nutrients.sugars).toBe(4.8);
    expect(result.packageQuantity).toBe(330);
    expect(result.packageUnit).toBe("ml");
  });

  it("detects a Czech serving and converts sodium to salt when needed", () => {
    const result = parseNutritionLabel(`
      Nutriční hodnoty na porci 30 g
      Energie 500 kJ
      Tuk 5 g
      Sacharidy 12 g
      Bílkoviny 3 g
      Sodík 200 mg
    `);

    expect(result.basisType).toBe("serving");
    expect(result.servingSize).toBe(30);
    expect(result.servingUnit).toBe("g");
    expect(result.nutrients.kcal).toBe(119.5);
    expect(result.nutrients.kj).toBe(500);
    expect(result.nutrients.salt).toBe(0.5);
  });

  it("returns no invented values for an unreadable table", () => {
    const result = parseNutritionLabel("Ingredients: oats, water, salt.");
    expect(result.nutrients).toEqual({});
    expect(result.matchedKeys).toEqual([]);
    expect(result.basisType).toBeNull();
  });

  it("accepts OCR rows where the label and value are glued together", () => {
    const result = parseNutritionLabel("Fat12g\nSalt1.2g\nProtein7,5g");
    expect(result.nutrients.fat).toBe(12);
    expect(result.nutrients.salt).toBe(1.2);
    expect(result.nutrients.protein).toBe(7.5);
  });
});
