import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLIT,
  deriveMacroTargets,
  splitFromGrams,
  suggestedCalories,
  suggestedMacroTargets,
  targetEnergyDifference,
  targetsMacroEnergy,
} from "@/lib/macroTargets";

const base = {
  kcal: 2000,
  protein: 160,
  carbs: 200,
  fat: 80,
  split: { protein: 30, carbs: 40, fat: 30 },
};

function successful(input: Parameters<typeof deriveMacroTargets>[0]) {
  const result = deriveMacroTargets(input);
  if (!result.ok) throw new Error(`Unexpected macro error: ${result.code}`);
  return result.targets;
}

describe("deriveMacroTargets modes", () => {
  it("Change Carbs fixes protein and fat and fits carbs", () => {
    const targets = successful({ ...base, adjustmentMode: "carbs" });
    expect(targets.protein).toBe(160);
    expect(targets.fat).toBe(80);
    expect(targets.carbs).toBe(160);
    expect(targetEnergyDifference(targets)).toBe(0);
  });

  it("Change Fats fixes protein and carbs and fits fat", () => {
    const targets = successful({ ...base, adjustmentMode: "fats" });
    expect(targets.protein).toBe(160);
    expect(targets.carbs).toBe(200);
    expect(targets.fat).toBeCloseTo(62.22, 2);
    expect(targetEnergyDifference(targets)).toBeCloseTo(0, 1);
  });

  it("Change Proteins fixes carbs and fat and fits protein", () => {
    const targets = successful({ ...base, adjustmentMode: "proteins" });
    expect(targets.carbs).toBe(200);
    expect(targets.fat).toBe(80);
    expect(targets.protein).toBe(120);
    expect(targetEnergyDifference(targets)).toBe(0);
  });

  it("Change All follows the stored energy split", () => {
    const targets = successful({ ...base, adjustmentMode: "all" });
    expect(targets.protein).toBe(150);
    expect(targets.carbs).toBe(200);
    expect(targets.fat).toBeCloseTo(66.67, 2);
    expect(targetEnergyDifference(targets)).toBeCloseTo(0, 1);
  });

  it("gives each mode a distinct result", () => {
    const results = (["carbs", "fats", "proteins", "all"] as const).map(
      (adjustmentMode) => successful({ ...base, adjustmentMode }),
    );
    const signatures = results.map(
      (targets) => `${targets.protein}/${targets.carbs}/${targets.fat}`,
    );
    expect(new Set(signatures).size).toBe(4);
  });

  it("keeps fixed macros unchanged when calories change", () => {
    const lower = successful({
      ...base,
      kcal: 1800,
      adjustmentMode: "carbs",
    });
    expect(lower.protein).toBe(160);
    expect(lower.fat).toBe(80);
    expect(lower.carbs).toBe(110);
  });
});

describe("invalid macro combinations", () => {
  it("refuses a negative carbs remainder", () => {
    const result = deriveMacroTargets({
      ...base,
      protein: 300,
      fat: 150,
      adjustmentMode: "carbs",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("negative-carbs");
      expect(result.kcalAvailableForMacro).toBeLessThan(0);
    }
  });

  it("refuses a negative fats remainder", () => {
    const result = deriveMacroTargets({
      ...base,
      protein: 300,
      carbs: 400,
      adjustmentMode: "fats",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("negative-fats");
  });

  it("refuses a negative protein remainder", () => {
    const result = deriveMacroTargets({
      ...base,
      carbs: 400,
      fat: 100,
      adjustmentMode: "proteins",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("negative-proteins");
  });

  it("validates calories, macros and the energy split", () => {
    expect(deriveMacroTargets({ ...base, kcal: 0, adjustmentMode: "carbs" })).toMatchObject({
      ok: false,
      code: "kcal",
    });
    expect(
      deriveMacroTargets({ ...base, kcal: 25000, adjustmentMode: "carbs" }),
    ).toMatchObject({ ok: false, code: "kcal" });
    expect(
      deriveMacroTargets({ ...base, protein: -1, adjustmentMode: "carbs" }),
    ).toMatchObject({ ok: false, code: "protein" });
    expect(
      deriveMacroTargets({
        ...base,
        split: { protein: 30, carbs: 40, fat: 20 },
        adjustmentMode: "all",
      }),
    ).toMatchObject({ ok: false, code: "split" });
  });
});

describe("decimal, zero and rounding behaviour", () => {
  it("supports decimal inputs while rounding stored targets to two decimals", () => {
    const targets = successful({
      ...base,
      kcal: 2100.5,
      protein: 120.25,
      fat: 70.5,
      adjustmentMode: "carbs",
    });
    expect(targets.protein).toBe(120.25);
    expect(targets.fat).toBe(70.5);
    expect(targets.carbs).toBe(246.25);
  });

  it("allows a fixed macro at zero", () => {
    const targets = successful({
      ...base,
      protein: 0,
      fat: 0,
      adjustmentMode: "carbs",
    });
    expect(targets.protein).toBe(0);
    expect(targets.fat).toBe(0);
    expect(targets.carbs).toBe(500);
  });

  it("never produces negative targets from a tiny remainder", () => {
    const targets = successful({
      ...base,
      kcal: 2000,
      protein: 499.99,
      fat: 0,
      adjustmentMode: "carbs",
    });
    expect(targets.carbs).toBeGreaterThanOrEqual(0);
    expect(targets.carbs).toBeLessThan(1);
  });
});

describe("macro split helpers", () => {
  it("derives a percentage split from gram targets", () => {
    const split = splitFromGrams({ protein: 160, carbs: 200, fat: 80 });
    expect(split.protein + split.carbs + split.fat).toBe(100);
    expect(split.carbs).toBeGreaterThan(split.fat);
    expect(split.protein).toBeCloseTo(29.6, 1);
  });

  it("falls back to the default split when all targets are zero", () => {
    expect(splitFromGrams({ protein: 0, carbs: 0, fat: 0 })).toEqual(DEFAULT_SPLIT);
  });

  it("reports the calorie contribution of gram targets", () => {
    expect(targetsMacroEnergy({ protein: 160, carbs: 200, fat: 80 })).toBe(2160);
  });

  it("rounds suggested calories to ten, without applying them", () => {
    expect(suggestedCalories(2500, "cut")).toBe(2130);
    expect(suggestedCalories(2500, "maintenance")).toBe(2500);
    expect(suggestedCalories(2500, "bulk")).toBe(2750);
  });

  it("suggests all four targets that add up to the calorie suggestion", () => {
    const maintenance = suggestedMacroTargets(2500, "maintenance");
    expect(maintenance).toMatchObject({
      kcal: 2500,
      protein: 187.5,
      carbs: 250,
      fat: 83.33,
      split: { protein: 30, carbs: 40, fat: 30 },
    });
    expect(Math.abs(targetEnergyDifference(maintenance))).toBeLessThan(1);

    const cut = suggestedMacroTargets(2500, "cut");
    expect(cut.kcal).toBe(2130);
    expect(cut.protein).toBe(186.38);
    expect(cut.carbs).toBe(186.38);
    expect(cut.fat).toBe(71);
    expect(Math.abs(targetEnergyDifference(cut))).toBeLessThan(1);

    const bulk = suggestedMacroTargets(2500, "bulk");
    expect(bulk.kcal).toBe(2750);
    expect(bulk.protein).toBe(171.88);
    expect(bulk.carbs).toBe(309.38);
    expect(bulk.fat).toBe(91.67);
    expect(Math.abs(targetEnergyDifference(bulk))).toBeLessThan(1);
  });
});
