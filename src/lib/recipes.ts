import { scaleNutrients, storageRound, totalNutrients } from "./nutrition";
import {
  EMPTY_NUTRIENTS,
  NUTRIENT_KEYS,
  type AmountUnit,
  type DiaryTotals,
  type EnergySource,
  type FoodNutrition,
  type Nutrients,
} from "./types";

export interface RecipeComponent {
  food: Pick<
    FoodNutrition,
    "basisType" | "servingSize" | "nutrients" | "energySource"
  >;
  amount: number;
  amountUnit: AmountUnit;
}

export interface RecipeNutrition {
  /** Sum of every ingredient at its entered amount. */
  batch: DiaryTotals;
  /** Only the ingredients entered in grams; informational, not the final weight. */
  ingredientGrams: number | null;
  /** Null until a positive final weight is known. */
  per100g: Nutrients | null;
  /** Null until a positive serving count is known. */
  perServing: Nutrients | null;
  servingWeightGrams: number | null;
  /** True when at least one ingredient has an unknown value for some nutrient. */
  incomplete: boolean;
  energySource: EnergySource;
}

function positiveOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function divide(batch: DiaryTotals, divisor: number): Nutrients {
  const scaled: Nutrients = { ...EMPTY_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) {
    const total = batch.nutrients[key];
    scaled[key] =
      total.value === null ? null : storageRound(total.value / divisor);
  }
  return scaled;
}

/**
 * Recipe totals always come from the same scaling path as diary logging, so a
 * per-100-g value shown here matches what gets stored when the recipe is logged.
 * Unknown ingredient values stay unknown instead of counting as zero.
 */
export function recipeNutrition(
  components: RecipeComponent[],
  finalWeightG: number | null,
  servings: number | null,
): RecipeNutrition {
  const portions = components.map((component) =>
    scaleNutrients(component.food, component.amount, component.amountUnit),
  );
  const batch = totalNutrients(portions);

  const gramTotal = components.reduce(
    (sum, component) =>
      component.amountUnit === "g" ? sum + component.amount : sum,
    0,
  );

  const weight = positiveOrNull(finalWeightG);
  const servingCount = positiveOrNull(servings);

  return {
    batch,
    ingredientGrams: gramTotal > 0 ? storageRound(gramTotal) : null,
    per100g: weight === null ? null : divide(batch, weight / 100),
    perServing: servingCount === null ? null : divide(batch, servingCount),
    servingWeightGrams:
      weight === null || servingCount === null
        ? null
        : storageRound(weight / servingCount),
    // kJ is the same energy in another unit, so a missing kJ value on an entry
    // that has kcal is not incomplete data.
    incomplete: NUTRIENT_KEYS.some(
      (key) => key !== "kj" && batch.nutrients[key].missingEntries > 0,
    ),
    // A recipe is only "provided" energy if every ingredient was; otherwise the
    // stored snapshot is labelled as derived, matching diary behaviour.
    energySource:
      batch.nutrients.kcal.value === null
        ? "unknown"
        : portions.some((portion) => portion.energySource !== "provided")
          ? "calculated"
          : "provided",
  };
}

/** Grams for a number of servings; null when the serving weight is unknown. */
export function gramsForServings(
  servingWeightGrams: number | null,
  servings: number,
): number | null {
  if (servingWeightGrams === null || !Number.isFinite(servingWeightGrams)) {
    return null;
  }
  if (!Number.isFinite(servings) || servings <= 0) return null;
  return storageRound(servingWeightGrams * servings);
}
