import {
  KCAL_PER_GRAM_CARBS,
  KCAL_PER_GRAM_FAT,
  KCAL_PER_GRAM_PROTEIN,
  macroEnergy,
  roundTo,
} from "./nutrition";
import type { GoalMode, MacroAdjustmentMode, MacroSplit } from "./types";

export const DEFAULT_SPLIT: MacroSplit = { protein: 30, carbs: 40, fat: 30 };

export const GOAL_FACTORS: Record<GoalMode, number> = {
  cut: 0.85,
  maintenance: 1,
  bulk: 1.1,
};

/** Starting macro splits used only for the labelled suggestion in Goals. */
export const GOAL_SPLITS: Record<GoalMode, MacroSplit> = {
  cut: { protein: 35, carbs: 35, fat: 30 },
  maintenance: { protein: 30, carbs: 40, fat: 30 },
  bulk: { protein: 25, carbs: 45, fat: 30 },
};

export type MacroErrorCode =
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "split"
  | "negative-carbs"
  | "negative-fats"
  | "negative-proteins";

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  split: MacroSplit;
  adjustmentMode: MacroAdjustmentMode;
}

export type MacroResult =
  | { ok: true; targets: MacroTargets }
  | { ok: false; code: MacroErrorCode; kcalAvailableForMacro: number };

export interface MacroInput {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  adjustmentMode: MacroAdjustmentMode;
  split: MacroSplit;
}

const MAX_KCAL = 20_000;

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Applies the selected macro adjustment mode to a calorie target.
 *
 * - carbs: protein and fat are fixed; carbs absorb the remaining calories
 * - fats: protein and carbs are fixed; fat absorbs the remaining calories
 * - proteins: carbs and fat are fixed; protein absorbs the remaining calories
 * - all: every macro follows the stored energy split percentages
 *
 * The result is deterministic and never includes a negative macro. The caller
 * must present the returned error to the user instead of saving.
 */
export function deriveMacroTargets(input: MacroInput): MacroResult {
  const { kcal, protein, carbs, fat, adjustmentMode, split } = input;
  if (!validNumber(kcal) || kcal <= 0 || kcal > MAX_KCAL) {
    return { ok: false, code: "kcal", kcalAvailableForMacro: 0 };
  }
  for (const [key, value, maximum] of [
    ["protein", protein, 2_000],
    ["carbs", carbs, 2_000],
    ["fat", fat, 1_000],
  ] as const) {
    if (!validNumber(value) || value < 0 || value > maximum) {
      return { ok: false, code: key, kcalAvailableForMacro: kcal };
    }
  }
  if (
    !validNumber(split.protein) ||
    !validNumber(split.carbs) ||
    !validNumber(split.fat) ||
    split.protein < 0 ||
    split.carbs < 0 ||
    split.fat < 0 ||
    Math.abs(split.protein + split.carbs + split.fat - 100) > 0.01
  ) {
    return { ok: false, code: "split", kcalAvailableForMacro: kcal };
  }

  let nextProtein = protein;
  let nextCarbs = carbs;
  let nextFat = fat;

  if (adjustmentMode === "all") {
    nextProtein = (kcal * split.protein) / 100 / KCAL_PER_GRAM_PROTEIN;
    nextCarbs = (kcal * split.carbs) / 100 / KCAL_PER_GRAM_CARBS;
    nextFat = (kcal * split.fat) / 100 / KCAL_PER_GRAM_FAT;
  } else if (adjustmentMode === "carbs") {
    const remaining =
      kcal - protein * KCAL_PER_GRAM_PROTEIN - fat * KCAL_PER_GRAM_FAT;
    if (remaining < -0.01) {
      return { ok: false, code: "negative-carbs", kcalAvailableForMacro: remaining };
    }
    nextCarbs = Math.max(0, remaining) / KCAL_PER_GRAM_CARBS;
  } else if (adjustmentMode === "fats") {
    const remaining =
      kcal - protein * KCAL_PER_GRAM_PROTEIN - carbs * KCAL_PER_GRAM_CARBS;
    if (remaining < -0.01) {
      return { ok: false, code: "negative-fats", kcalAvailableForMacro: remaining };
    }
    nextFat = Math.max(0, remaining) / KCAL_PER_GRAM_FAT;
  } else {
    const remaining =
      kcal - carbs * KCAL_PER_GRAM_CARBS - fat * KCAL_PER_GRAM_FAT;
    if (remaining < -0.01) {
      return {
        ok: false,
        code: "negative-proteins",
        kcalAvailableForMacro: remaining,
      };
    }
    nextProtein = Math.max(0, remaining) / KCAL_PER_GRAM_PROTEIN;
  }

  return {
    ok: true,
    targets: {
      kcal: roundTo(kcal, 2),
      protein: roundTo(nextProtein, 2),
      carbs: roundTo(nextCarbs, 2),
      fat: roundTo(nextFat, 2),
      split: {
        protein: roundTo(split.protein, 2),
        carbs: roundTo(split.carbs, 2),
        fat: roundTo(split.fat, 2),
      },
      adjustmentMode,
    },
  };
}

export function targetsMacroEnergy(targets: {
  protein: number;
  carbs: number;
  fat: number;
}): number {
  return macroEnergy(targets.protein, targets.carbs, targets.fat);
}

export function targetEnergyDifference(targets: {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}): number {
  return roundTo(targets.kcal - targetsMacroEnergy(targets), 2);
}

/** Derives a starting energy split from existing gram targets. */
export function splitFromGrams(targets: {
  protein: number;
  carbs: number;
  fat: number;
}): MacroSplit {
  const proteinKcal = targets.protein * KCAL_PER_GRAM_PROTEIN;
  const carbsKcal = targets.carbs * KCAL_PER_GRAM_CARBS;
  const fatKcal = targets.fat * KCAL_PER_GRAM_FAT;
  const total = proteinKcal + carbsKcal + fatKcal;
  if (total <= 0) return { ...DEFAULT_SPLIT };
  let proteinPct = roundTo((proteinKcal / total) * 100, 1);
  let carbsPct = roundTo((carbsKcal / total) * 100, 1);
  let fatPct = roundTo((fatKcal / total) * 100, 1);
  // Independent rounding can add up to 99.9 or 100.1; put the remainder on the
  // largest component so the stored split always passes validation.
  const remainder = roundTo(100 - (proteinPct + carbsPct + fatPct), 1);
  if (proteinPct >= carbsPct && proteinPct >= fatPct) {
    proteinPct = Math.max(0, roundTo(proteinPct + remainder, 1));
  } else if (carbsPct >= fatPct) {
    carbsPct = Math.max(0, roundTo(carbsPct + remainder, 1));
  } else {
    fatPct = Math.max(0, roundTo(fatPct + remainder, 1));
  }
  return { protein: proteinPct, carbs: carbsPct, fat: fatPct };
}

/** Explicit, labelled suggestion shown in Nutrition Goals. Never auto-applied. */
export function suggestedCalories(
  maintenanceCalories: number,
  goalMode: GoalMode,
): number {
  return Math.round((maintenanceCalories * GOAL_FACTORS[goalMode]) / 10) * 10;
}

/**
 * Complete, deterministic starting suggestion for Nutrition Goals. The user
 * must still review and save it; it is never applied automatically. Splits are
 * simple starting points for cut/maintenance/bulk, not medical prescriptions.
 */
export function suggestedMacroTargets(
  maintenanceCalories: number,
  goalMode: GoalMode,
): MacroTargets {
  const kcal = suggestedCalories(maintenanceCalories, goalMode);
  const split = GOAL_SPLITS[goalMode];
  return {
    kcal,
    protein: roundTo((kcal * split.protein) / 100 / KCAL_PER_GRAM_PROTEIN, 2),
    carbs: roundTo((kcal * split.carbs) / 100 / KCAL_PER_GRAM_CARBS, 2),
    fat: roundTo((kcal * split.fat) / 100 / KCAL_PER_GRAM_FAT, 2),
    split,
    adjustmentMode: "all",
  };
}
