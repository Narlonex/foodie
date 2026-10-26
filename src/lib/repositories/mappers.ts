import type {
  AmountUnit,
  BasisType,
  DiaryEntry,
  DayType,
  EnergySource,
  Food,
  FoodSource,
  MacroAdjustmentMode,
  Meal,
  Nutrients,
  Preparation,
  SavedMeal,
  SavedMealItem,
} from "../types";
import type { FoodNutrition } from "../types";

export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toRequiredNumber(value: string | number): number {
  return Number(value);
}

export interface FoodRow {
  id: string;
  source: FoodSource;
  external_id: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  basis_type: BasisType;
  serving_size: string | number | null;
  serving_unit: "g" | "ml" | null;
  kcal: string | number | null;
  kj: string | number | null;
  protein_g: string | number | null;
  carbs_g: string | number | null;
  sugars_g: string | number | null;
  fat_g: string | number | null;
  sat_fat_g: string | number | null;
  fiber_g: string | number | null;
  salt_g: string | number | null;
  energy_source: EnergySource;
  preparation: Preparation;
  is_favorite: boolean;
  image_url: string | null;
  has_image: boolean;
  package_quantity: string | number | null;
  package_unit: "g" | "ml" | null;
  drained_weight: string | number | null;
}

export function nutrientsFromRow(row: {
  kcal: string | number | null;
  kj: string | number | null;
  protein_g: string | number | null;
  carbs_g: string | number | null;
  sugars_g: string | number | null;
  fat_g: string | number | null;
  sat_fat_g: string | number | null;
  fiber_g: string | number | null;
  salt_g: string | number | null;
}): Nutrients {
  return {
    kcal: toNumber(row.kcal),
    kj: toNumber(row.kj),
    protein: toNumber(row.protein_g),
    carbs: toNumber(row.carbs_g),
    sugars: toNumber(row.sugars_g),
    fat: toNumber(row.fat_g),
    satFat: toNumber(row.sat_fat_g),
    fiber: toNumber(row.fiber_g),
    salt: toNumber(row.salt_g),
  };
}

export function mapFood(row: FoodRow): Food {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    imageUrl:
      row.image_url ??
      (row.has_image ? `/api/foods/${row.id}/image` : null),
    basisType: row.basis_type,
    servingSize: toNumber(row.serving_size),
    servingUnit: row.serving_unit,
    nutrients: nutrientsFromRow(row),
    energySource: row.energy_source,
    isFavorite: row.is_favorite,
    preparation: row.preparation ?? "unspecified",
    packageQuantity: toNumber(row.package_quantity),
    packageUnit: row.package_unit,
    drainedWeight: toNumber(row.drained_weight),
  };
}

export interface EntryRow
  extends Omit<
    FoodRow,
    | "is_favorite"
    | "external_id"
    | "has_image"
    | "package_quantity"
    | "package_unit"
    | "drained_weight"
  > {
  food_id: string | null;
  date: string;
  meal: Meal;
  amount: string | number;
  amount_unit: AmountUnit;
  logged_at: Date | string;
}

export function mapEntry(row: EntryRow): DiaryEntry {
  const nutrition: FoodNutrition = {
    basisType: row.basis_type,
    servingSize: toNumber(row.serving_size),
    servingUnit: row.serving_unit,
    nutrients: nutrientsFromRow(row),
    energySource: row.energy_source,
  };
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    foodId: row.food_id,
    source: row.source,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    imageUrl: row.image_url ?? null,
    preparation: row.preparation ?? "unspecified",
    ...nutrition,
    amount: toRequiredNumber(row.amount),
    amountUnit: row.amount_unit,
    loggedAt:
      row.logged_at instanceof Date
        ? row.logged_at.toISOString()
        : String(row.logged_at),
  };
}

export interface DayTypeRow {
  id: string;
  name: string;
  kcal: string | number;
  protein_g: string | number;
  carbs_g: string | number;
  fat_g: string | number;
  adjustment_mode: MacroAdjustmentMode;
  protein_pct: string | number;
  carbs_pct: string | number;
  fat_pct: string | number;
}

export function mapDayType(row: DayTypeRow): DayType {
  return {
    id: row.id,
    name: row.name,
    kcal: toRequiredNumber(row.kcal),
    protein: toRequiredNumber(row.protein_g),
    carbs: toRequiredNumber(row.carbs_g),
    fat: toRequiredNumber(row.fat_g),
    adjustmentMode: row.adjustment_mode,
    split: {
      protein: toRequiredNumber(row.protein_pct),
      carbs: toRequiredNumber(row.carbs_pct),
      fat: toRequiredNumber(row.fat_pct),
    },
  };
}

export interface SavedMealRow {
  id: string;
  name: string;
  final_weight_g: string | number | null;
  servings: string | number | null;
}

export function mapSavedMeal(
  row: SavedMealRow,
  items: SavedMealItem[],
): SavedMeal {
  return {
    id: row.id,
    name: row.name,
    finalWeightG: toNumber(row.final_weight_g),
    servings: toNumber(row.servings),
    items,
  };
}
