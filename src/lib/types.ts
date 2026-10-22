export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Meal = (typeof MEALS)[number];

export const NUTRIENT_KEYS = [
  "kcal",
  "kj",
  "protein",
  "carbs",
  "sugars",
  "fat",
  "satFat",
  "fiber",
  "salt",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** null always means "unknown", never zero. Values are grams unless noted. */
export type Nutrients = Record<NutrientKey, number | null>;

export type BasisType = "100g" | "100ml" | "serving";
export type AmountUnit = "g" | "ml" | "serving";
export type FoodSource = "off" | "usda" | "custom";
export type EnergySource = "provided" | "calculated" | "unknown";
export type Language = "en" | "sk";
export type Theme = "dark" | "light";
export type UnitSystem = "metric" | "imperial";
export type GoalMode = "cut" | "maintenance" | "bulk";
export type MacroAdjustmentMode = "carbs" | "fats" | "proteins" | "all";

export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodNutrition {
  basisType: BasisType;
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
  nutrients: Nutrients;
  energySource: EnergySource;
}

export interface Food extends FoodNutrition {
  id?: string;
  source: FoodSource;
  externalId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  isFavorite: boolean;
}

/** A validated food from an external source, before it is saved for a user. */
export interface FoodCandidate extends FoodNutrition {
  source: FoodSource;
  externalId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
}

export interface DiaryEntry extends FoodNutrition {
  id: string;
  date: string;
  meal: Meal;
  foodId: string | null;
  source: FoodSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  amount: number;
  amountUnit: AmountUnit;
  loggedAt: string;
}

export interface DayType {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  adjustmentMode: MacroAdjustmentMode;
  split: MacroSplit;
}

export interface Profile {
  userId: string;
  email: string;
  language: Language;
  theme: Theme;
  unitSystem: UnitSystem;
  goalMode: GoalMode;
  maintenanceCalories: number | null;
  defaultDayTypeId: string | null;
  usdaEnabled: boolean;
}

export interface Viewer {
  user: { id: string; email: string };
  profile: Profile;
}

export interface SavedMealItem {
  id: string;
  food: Food;
  amount: number;
  amountUnit: AmountUnit;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
}

export interface NutrientTotal {
  value: number | null;
  /** Entries that had a known value for this nutrient. */
  knownEntries: number;
  /** Entries whose value for this nutrient was unknown. */
  missingEntries: number;
}

export interface DiaryTotals {
  entryCount: number;
  nutrients: Record<NutrientKey, NutrientTotal>;
  calculatedEnergyEntries: number;
  unknownEnergyEntries: number;
}

export interface DaySummary {
  date: string;
  entries: DiaryEntry[];
  totals: DiaryTotals;
  dayType: DayType | null;
  dayTypeName: string | null;
  assignedDayTypeId: string | null;
}

export const NUTRIENT_LABEL_KEYS: Record<NutrientKey, string> = {
  kcal: "nutrient.kcal",
  kj: "nutrient.kj",
  protein: "nutrient.protein",
  carbs: "nutrient.carbs",
  sugars: "nutrient.sugars",
  fat: "nutrient.fat",
  satFat: "nutrient.saturatedFat",
  fiber: "nutrient.fiber",
  salt: "nutrient.salt",
};

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: null,
  kj: null,
  protein: null,
  carbs: null,
  sugars: null,
  fat: null,
  satFat: null,
  fiber: null,
  salt: null,
};

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

export function isBasisType(value: unknown): value is BasisType {
  return value === "100g" || value === "100ml" || value === "serving";
}

export function isAmountUnit(value: unknown): value is AmountUnit {
  return value === "g" || value === "ml" || value === "serving";
}

export function expectedAmountUnit(basis: BasisType): AmountUnit {
  if (basis === "100g") return "g";
  if (basis === "100ml") return "ml";
  return "serving";
}

export function basisLabel(
  basis: BasisType,
  servingSize: number | null,
  servingUnit: "g" | "ml" | null,
): string {
  if (basis === "100g") return "100 g";
  if (basis === "100ml") return "100 ml";
  const size = servingSize ?? 1;
  const unit = servingUnit ?? "g";
  return `${formatAmount(size)} ${unit}`;
}

export function formatAmount(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);
}
