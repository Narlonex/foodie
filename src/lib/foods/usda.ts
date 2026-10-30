import "server-only";
import { env } from "../env";
import { parsePackageSize } from "../package";
import { detectPreparation } from "./preparation";
import { normalizeNutrients } from "../nutrition";
import { EMPTY_NUTRIENTS, type FoodCandidate, type Nutrients } from "../types";
import { FoodApiError } from "./openFoodFacts";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const NUTRIENT_IDS = {
  kcal: 1008,
  // Foundation foods often omit 1008 and report energy only through the
  // Atwater factors, so both are accepted as a label-equivalent energy value.
  kcalAtwaterGeneral: 2047,
  kcalAtwaterSpecific: 2048,
  kj: 1062,
  protein: 1003,
  carbs: 1005,
  sugars: 2000,
  fat: 1004,
  satFat: 1258,
  fiber: 1079,
} as const;

interface UsdaNutrient {
  nutrientId?: number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface UsdaFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  gtinUpc?: string;
  packageWeight?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaNutrient[];
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isUsdaEnabled(): boolean {
  return Boolean(env.usdaApiKey);
}

export function normalizeUsdaFood(raw: UsdaFood): FoodCandidate | null {
  if (!raw.fdcId || !raw.description) return null;
  const byId = new Map<number, number>();
  for (const nutrient of raw.foodNutrients ?? []) {
    if (
      typeof nutrient.nutrientId === "number" &&
      typeof nutrient.value === "number" &&
      Number.isFinite(nutrient.value)
    ) {
      byId.set(nutrient.nutrientId, nutrient.value);
    }
  }
  const kcalValue =
    byId.get(NUTRIENT_IDS.kcal) ??
    byId.get(NUTRIENT_IDS.kcalAtwaterGeneral) ??
    byId.get(NUTRIENT_IDS.kcalAtwaterSpecific) ??
    null;
  const rawNutrients: Nutrients = {
    ...EMPTY_NUTRIENTS,
    kcal: kcalValue,
    kj: byId.get(NUTRIENT_IDS.kj) ?? null,
    protein: byId.get(NUTRIENT_IDS.protein) ?? null,
    carbs: byId.get(NUTRIENT_IDS.carbs) ?? null,
    sugars: byId.get(NUTRIENT_IDS.sugars) ?? null,
    fat: byId.get(NUTRIENT_IDS.fat) ?? null,
    satFat: byId.get(NUTRIENT_IDS.satFat) ?? null,
    fiber: byId.get(NUTRIENT_IDS.fiber) ?? null,
    salt: null,
  };
  const hadKcal = kcalValue !== null;
  if (!hadKcal && rawNutrients.kj !== null) {
    rawNutrients.kcal = rawNutrients.kj / 4.184;
  }
  const normalized = normalizeNutrients(rawNutrients);
  const { kcal, protein, carbs, fat } = normalized.nutrients;
  // A search hit that carries only trace nutrients (fatty acids, vitamins) is
  // not a usable food row, so it is dropped instead of shown with empty macros.
  if (kcal === null && protein === null && carbs === null && fat === null) {
    return null;
  }
  return {
    source: "usda",
    externalId: String(raw.fdcId),
    barcode: null,
    name: raw.description,
    brand: raw.brandName?.trim() || raw.brandOwner?.trim() || null,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: normalized.nutrients,
    energySource:
      !hadKcal && normalized.energySource === "provided"
        ? "calculated"
        : normalized.energySource,
    imageUrl: null,
    // USDA FoodData Central publishes no package data, so the package
    // calculator stays unavailable for these foods instead of guessing.
    preparation: detectPreparation(raw.description),
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

interface UsdaSearchInput {
  query: string;
  dataType: string[];
  pageSize: number;
}

async function requestUsdaFoods(input: UsdaSearchInput): Promise<UsdaFood[]> {
  if (!env.usdaApiKey) {
    throw new FoodApiError("unavailable", "USDA FoodData Central is not configured.");
  }
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set("api_key", env.usdaApiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": env.offUserAgent,
      },
      body: JSON.stringify({
        query: input.query,
        dataType: input.dataType,
        pageSize: input.pageSize,
        pageNumber: 1,
      }),
      signal: AbortSignal.timeout(9_000),
      next: { revalidate: 600 },
    });
  } catch {
    throw new FoodApiError("unavailable", "USDA FoodData Central could not be reached.");
  }

  if (response.status === 429) {
    throw new FoodApiError("rate-limited", "USDA FoodData Central is rate limiting requests.");
  }
  if (!response.ok) {
    throw new FoodApiError("unavailable", "USDA FoodData Central is unavailable.");
  }
  let payload: { foods?: UsdaFood[] };
  try {
    payload = (await response.json()) as { foods?: UsdaFood[] };
  } catch {
    throw new FoodApiError("invalid", "USDA FoodData Central returned malformed data.");
  }
  return Array.isArray(payload.foods) ? payload.foods : [];
}

export async function searchUsda(query: string): Promise<FoodCandidate[]> {
  const foods = await requestUsdaFoods({
    query,
    dataType: ["Foundation", "SR Legacy"],
    pageSize: 16,
  });
  const seen = new Set<string>();
  const results: FoodCandidate[] = [];
  for (const food of foods) {
    const candidate = normalizeUsdaFood(food);
    if (!candidate || !candidate.externalId) continue;
    if (seen.has(candidate.externalId)) continue;
    seen.add(candidate.externalId);
    results.push(candidate);
  }
  return results;
}

/** GTINs are printed with different zero padding on labels and in FDC. */
function gtinKey(value: string | undefined | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.replace(/^0+/, "") || "0";
}

function servingFields(raw: UsdaFood): {
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
} {
  const size = numberValue(raw.servingSize);
  const unit = (raw.servingSizeUnit ?? "").trim().toLowerCase();
  if (size === null || size <= 0) return { servingSize: null, servingUnit: null };
  if (unit === "g" || unit === "grm" || unit === "gram") {
    return { servingSize: size, servingUnit: "g" };
  }
  if (unit === "ml" || unit === "mlt" || unit === "milliliter") {
    return { servingSize: size, servingUnit: "ml" };
  }
  return { servingSize: null, servingUnit: null };
}

function packageFields(raw: UsdaFood): {
  packageQuantity: number | null;
  packageUnit: "g" | "ml" | null;
} {
  const text = raw.packageWeight?.trim();
  if (!text) return { packageQuantity: null, packageUnit: null };
  // Branded records often print dual units, e.g. "0.84 oz/24 g" or
  // "12 fl oz/355 mL". Parse each part and use the metric one; never convert
  // an ounce guess into a package size.
  const parts = [text, ...text.split("/").map((part) => part.trim())];
  for (const part of parts) {
    const parsed = parsePackageSize(part);
    if (parsed) return { packageQuantity: parsed.quantity, packageUnit: parsed.unit };
  }
  return { packageQuantity: null, packageUnit: null };
}

/**
 * Normalizes a branded USDA record into a barcode product. Branded nutrient
 * values are published per 100 g, so the basis stays 100 g even when a serving
 * size is printed; the serving size is kept for display only.
 */
export function normalizeUsdaBarcode(
  raw: UsdaFood,
  barcode: string,
): FoodCandidate | null {
  const base = normalizeUsdaFood(raw);
  if (!base) return null;
  const serving = servingFields(raw);
  const pkg = packageFields(raw);
  return {
    ...base,
    barcode,
    brand: raw.brandName?.trim() || base.brand,
    servingSize: serving.servingSize,
    servingUnit: serving.servingUnit,
    packageQuantity: pkg.packageQuantity,
    packageUnit: pkg.packageUnit,
    drainedWeight: null,
  };
}

export async function lookupUsdaBarcode(barcode: string): Promise<FoodCandidate> {
  const foods = await requestUsdaFoods({
    query: barcode,
    dataType: ["Branded"],
    pageSize: 10,
  });
  const wanted = gtinKey(barcode);
  const matches = foods.filter((food) => gtinKey(food.gtinUpc) === wanted);
  for (const food of matches) {
    const candidate = normalizeUsdaBarcode(food, barcode);
    if (candidate) return candidate;
  }
  if (matches.length > 0) {
    throw new FoodApiError("no-data", "The branded record has no nutrition data.");
  }
  throw new FoodApiError("not-found", "Product not found.");
}
