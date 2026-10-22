import "server-only";
import { env } from "../env";
import { normalizeNutrients } from "../nutrition";
import { EMPTY_NUTRIENTS, type FoodCandidate, type Nutrients } from "../types";
import { FoodApiError } from "./openFoodFacts";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const NUTRIENT_IDS = {
  kcal: 1008,
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
  dataType?: string;
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
  const rawNutrients: Nutrients = {
    ...EMPTY_NUTRIENTS,
    kcal: byId.get(NUTRIENT_IDS.kcal) ?? null,
    kj: byId.get(NUTRIENT_IDS.kj) ?? null,
    protein: byId.get(NUTRIENT_IDS.protein) ?? null,
    carbs: byId.get(NUTRIENT_IDS.carbs) ?? null,
    sugars: byId.get(NUTRIENT_IDS.sugars) ?? null,
    fat: byId.get(NUTRIENT_IDS.fat) ?? null,
    satFat: byId.get(NUTRIENT_IDS.satFat) ?? null,
    fiber: byId.get(NUTRIENT_IDS.fiber) ?? null,
    salt: null,
  };
  const hadKcal = rawNutrients.kcal !== null;
  if (!hadKcal && rawNutrients.kj !== null) {
    rawNutrients.kcal = rawNutrients.kj / 4.184;
  }
  const normalized = normalizeNutrients(rawNutrients);
  if (
    !Object.values(normalized.nutrients).some(
      (value) => value !== null && value !== undefined,
    )
  ) {
    return null;
  }
  return {
    source: "usda",
    externalId: String(raw.fdcId),
    barcode: null,
    name: raw.description,
    brand: raw.brandOwner?.trim() || null,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: normalized.nutrients,
    energySource:
      !hadKcal && normalized.energySource === "provided"
        ? "calculated"
        : normalized.energySource,
  };
}

export async function searchUsda(query: string): Promise<FoodCandidate[]> {
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
        query,
        dataType: ["Foundation", "SR Legacy"],
        pageSize: 16,
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
  if (!Array.isArray(payload.foods)) return [];
  const seen = new Set<string>();
  const results: FoodCandidate[] = [];
  for (const food of payload.foods) {
    const candidate = normalizeUsdaFood(food);
    if (!candidate || !candidate.externalId) continue;
    if (seen.has(candidate.externalId)) continue;
    seen.add(candidate.externalId);
    results.push(candidate);
  }
  return results;
}
