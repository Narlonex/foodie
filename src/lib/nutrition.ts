import {
  EMPTY_NUTRIENTS,
  NUTRIENT_KEYS,
  type AmountUnit,
  type BasisType,
  type DiaryEntry,
  type DiaryTotals,
  type EnergySource,
  type FoodNutrition,
  type NutrientKey,
  type NutrientTotal,
  type Nutrients,
  expectedAmountUnit,
} from "./types";

export const KCAL_PER_GRAM_PROTEIN = 4;
export const KCAL_PER_GRAM_CARBS = 4;
export const KCAL_PER_GRAM_FAT = 9;
export const KJ_PER_KCAL = 4.184;
export const GRAMS_PER_OUNCE = 28.349523125;
export const ML_PER_FLUID_OUNCE = 29.5735295625;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Store four decimal places; display rounding happens in the UI. */
export function storageRound(value: number): number {
  return roundTo(value, 4);
}

/**
 * Energy is taken from the source when present. Only when kcal is absent and all
 * three macros are known do we derive it with the Atwater convention (4/4/9).
 * A derived value is marked so the UI never presents it as a label value.
 */
export function resolveEnergy(nutrients: Nutrients): {
  kcal: number | null;
  energySource: EnergySource;
} {
  if (nutrients.kcal !== null) {
    return { kcal: nutrients.kcal, energySource: "provided" };
  }
  const { protein, carbs, fat } = nutrients;
  if (protein !== null && carbs !== null && fat !== null) {
    return {
      kcal:
        protein * KCAL_PER_GRAM_PROTEIN +
        carbs * KCAL_PER_GRAM_CARBS +
        fat * KCAL_PER_GRAM_FAT,
      energySource: "calculated",
    };
  }
  return { kcal: null, energySource: "unknown" };
}

export function normalizeNutrients(input: Partial<Nutrients>): {
  nutrients: Nutrients;
  energySource: EnergySource;
} {
  const nutrients: Nutrients = { ...EMPTY_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) {
    const value = input[key];
    nutrients[key] = isFiniteNonNegative(value) ? value : null;
  }
  const energy = resolveEnergy(nutrients);
  nutrients.kcal = energy.kcal;
  return { nutrients, energySource: energy.energySource };
}

export function basisQuantity(
  basisType: BasisType,
  servingSize: number | null,
): number {
  if (basisType === "100g" || basisType === "100ml") return 100;
  if (!servingSize || !Number.isFinite(servingSize) || servingSize <= 0) {
    throw new Error("A serving-based food needs a positive serving size.");
  }
  return servingSize;
}

export function amountUnitForBasis(basisType: BasisType): AmountUnit {
  return expectedAmountUnit(basisType);
}

export function assertAmountForBasis(
  basisType: BasisType,
  amountUnit: AmountUnit,
): void {
  if (expectedAmountUnit(basisType) !== amountUnit) {
    throw new Error(
      `Amount unit ${amountUnit} does not match nutrition basis ${basisType}.`,
    );
  }
}

/** Scales nutrients from the food's basis to the consumed amount. */
export function scaleNutrients(
  food: Pick<
    FoodNutrition,
    "basisType" | "servingSize" | "nutrients" | "energySource"
  >,
  amount: number,
  amountUnit: AmountUnit,
): { nutrients: Nutrients; factor: number; energySource: EnergySource } {
  assertAmountForBasis(food.basisType, amountUnit);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const factor = amount / basisQuantity(food.basisType, food.servingSize);
  const scaled: Nutrients = { ...EMPTY_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) {
    const value = food.nutrients[key];
    scaled[key] = value === null ? null : storageRound(value * factor);
  }
  return { nutrients: scaled, factor, energySource: food.energySource };
}

/** Converts user input in the selected unit system to the stored base amount. */
export function toBaseAmount(
  input: number,
  unit: "g" | "ml" | "oz" | "floz" | "serving",
): { amount: number; amountUnit: AmountUnit } {
  if (!Number.isFinite(input) || input <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  switch (unit) {
    case "g":
      return { amount: roundTo(input, 3), amountUnit: "g" };
    case "ml":
      return { amount: roundTo(input, 3), amountUnit: "ml" };
    case "oz":
      return { amount: roundTo(input * GRAMS_PER_OUNCE, 3), amountUnit: "g" };
    case "floz":
      return { amount: roundTo(input * ML_PER_FLUID_OUNCE, 3), amountUnit: "ml" };
    case "serving":
      return { amount: roundTo(input, 3), amountUnit: "serving" };
  }
}

export function fromBaseAmount(
  amount: number,
  amountUnit: AmountUnit,
  unitSystem: "metric" | "imperial",
): { value: number; unit: "g" | "ml" | "serving" | "oz" | "floz" } {
  if (unitSystem === "imperial") {
    if (amountUnit === "g") {
      return { value: roundTo(amount / GRAMS_PER_OUNCE, 2), unit: "oz" };
    }
    if (amountUnit === "ml") {
      return { value: roundTo(amount / ML_PER_FLUID_OUNCE, 2), unit: "floz" };
    }
  }
  return { value: amount, unit: amountUnit };
}

function emptyTotal(): NutrientTotal {
  return { value: null, knownEntries: 0, missingEntries: 0 };
}

/**
 * Daily totals come from persisted entries. Unknown values stay unknown: the
 * total is flagged partial rather than treating missing data as zero.
 */
export function totalNutrients(
  entries: ReadonlyArray<{ nutrients: Nutrients; energySource: EnergySource }>,
): DiaryTotals {
  const totals = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, emptyTotal()]),
  ) as Record<NutrientKey, NutrientTotal>;

  let calculatedEnergyEntries = 0;
  let unknownEnergyEntries = 0;

  for (const entry of entries) {
    if (entry.energySource === "calculated") calculatedEnergyEntries += 1;
    if (entry.nutrients.kcal === null) unknownEnergyEntries += 1;
    for (const key of NUTRIENT_KEYS) {
      const value = entry.nutrients[key];
      const total = totals[key];
      if (value === null) {
        total.missingEntries += 1;
      } else {
        total.value = storageRound((total.value ?? 0) + value);
        total.knownEntries += 1;
      }
    }
  }

  return {
    entryCount: entries.length,
    nutrients: totals,
    calculatedEnergyEntries,
    unknownEnergyEntries,
  };
}

export function isPartialTotal(total: NutrientTotal): boolean {
  return total.missingEntries > 0;
}

export function macroEnergy(protein: number, carbs: number, fat: number): number {
  return roundTo(
    protein * KCAL_PER_GRAM_PROTEIN +
      carbs * KCAL_PER_GRAM_CARBS +
      fat * KCAL_PER_GRAM_FAT,
    2,
  );
}

export function entryPortion(
  entry: Pick<
    DiaryEntry,
    "basisType" | "servingSize" | "nutrients" | "energySource" | "amount" | "amountUnit"
  >,
): { nutrients: Nutrients; factor: number; energySource: EnergySource } {
  return scaleNutrients(entry, entry.amount, entry.amountUnit);
}

export function consumedFromEntries(entries: DiaryEntry[]) {
  return totalNutrients(entries);
}

export function remainingTarget(
  target: number | null | undefined,
  consumed: NutrientTotal | number | null,
): number | null {
  if (target === null || target === undefined || !Number.isFinite(target)) {
    return null;
  }
  const consumedValue =
    typeof consumed === "number" ? consumed : (consumed?.value ?? null);
  if (consumedValue === null) return null;
  return roundTo(target - consumedValue, 2);
}

export function clampedPercent(consumed: number | null, target: number | null) {
  if (consumed === null || target === null || target <= 0) return 0;
  return Math.max(0, Math.min(100, (consumed / target) * 100));
}

export function formatNutrientValue(
  value: number | null,
  key: NutrientKey,
  locale: string,
): string | null {
  if (value === null) return null;
  const digits = key === "kcal" ? 0 : key === "salt" ? 2 : key === "kj" ? 0 : 1;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Energy in kJ, converted from kcal only for display when kJ is unknown. */
export function displayKj(
  kj: number | null,
  kcal: number | null,
): { value: number | null; converted: boolean } {
  if (kj !== null) return { value: kj, converted: false };
  if (kcal !== null) return { value: roundTo(kcal * KJ_PER_KCAL, 0), converted: true };
  return { value: null, converted: false };
}
