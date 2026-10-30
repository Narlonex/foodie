import "server-only";
import { env } from "../env";
import { parsePackageSize } from "../package";
import { detectPreparation } from "./preparation";
import { normalizeNutrients } from "../nutrition";
import type {
  BasisType,
  FoodCandidate,
  NutrientKey,
  Nutrients,
} from "../types";
import { EMPTY_NUTRIENTS } from "../types";

const SEARCH_URL = "https://search.openfoodfacts.org/search";
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v3.6/product";
const LEGACY_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const SEARCH_FIELDS = [
  "code",
  "product_name",
  "product_name_sk",
  "product_name_cs",
  "brands",
  "quantity",
  "nutriments",
  "nutrition_data_per",
  "serving_size",
  "serving_quantity",
  "countries_tags",
  "image_front_small_url",
  "image_front_url",
  "image_url",
].join(",");

export class FoodApiError extends Error {
  readonly kind: "not-found" | "rate-limited" | "unavailable" | "no-data" | "invalid";

  constructor(kind: FoodApiError["kind"], message: string) {
    super(message);
    this.name = "FoodApiError";
    this.kind = kind;
  }
}

function headers(): HeadersInit {
  return {
    "User-Agent": env.offUserAgent,
    Accept: "application/json",
  };
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Net package quantity and drained weight, read only from what the record
 * prints. A missing or unreadable quantity stays null so the package calculator
 * can ask the user instead of inventing a size.
 */
function packageFields(raw: Record<string, unknown>): {
  packageQuantity: number | null;
  packageUnit: "g" | "ml" | null;
  drainedWeight: number | null;
} {
  const size = parsePackageSize(textValue(raw.quantity));
  const drained = parsePackageSize(textValue(raw.drained_weight));
  const drainedNumber = drained?.quantity ?? numberValue(raw.drained_weight);
  return {
    packageQuantity: size?.quantity ?? null,
    packageUnit: size?.unit ?? null,
    drainedWeight:
      drainedNumber !== null && drainedNumber > 0 && size?.unit !== "ml"
        ? drainedNumber
        : null,
  };
}

function catalogFields(raw: Record<string, unknown>, name: string) {
  return { preparation: detectPreparation(name), ...packageFields(raw) };
}

function imageValue(raw: Record<string, unknown>): string | null {
  for (const key of [
    "image_front_small_url",
    "image_front_url",
    "image_url",
  ]) {
    const value = textValue(raw[key]);
    if (value && value.startsWith("https://")) return value;
  }
  return null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    );
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

function unitFromQuantity(quantity: string | null): "g" | "ml" {
  if (!quantity) return "g";
  return /\b(ml|cl|l|liter|litre)\b/i.test(quantity) ? "ml" : "g";
}

function productName(raw: Record<string, unknown>): string | null {
  return (
    textValue(raw.product_name_sk) ??
    textValue(raw.product_name_cs) ??
    textValue(raw.product_name)
  );
}

interface NutrientLookup {
  get: (key: string) => number | null;
}

function hasKnownNutrient(nutrients: Nutrients): boolean {
  return Object.values(nutrients).some((value) => value !== null && value !== undefined);
}

function lookupFromLegacyNutriments(
  nutriments: Record<string, unknown>,
): NutrientLookup {
  const get = (key: string): number | null =>
    numberValue(nutriments[`${key}_100g`]);
  return { get };
}

function lookupFromNutrientMap(
  nutrients: Record<string, unknown>,
): NutrientLookup {
  const get = (key: string): number | null => {
    const entry = nutrients[key];
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (record.modifier === "~" && record.source === "estimate") return null;
    return numberValue(record.value);
  };
  return { get };
}

function nutrientsFromLookup(lookup: NutrientLookup): {
  nutrients: Nutrients;
  energySource: "provided" | "calculated" | "unknown";
} {
  const kcalDirect = lookup.get("energy-kcal");
  const kjDirect = lookup.get("energy-kj");
  const kcal =
    kcalDirect ?? (kjDirect !== null ? kjDirect / 4.184 : null);
  const raw: Nutrients = {
    ...EMPTY_NUTRIENTS,
    kcal,
    kj: lookup.get("energy-kj") ?? lookup.get("energy"),
    protein: lookup.get("proteins"),
    carbs: lookup.get("carbohydrates"),
    sugars: lookup.get("sugars"),
    fat: lookup.get("fat"),
    satFat: lookup.get("saturated-fat"),
    fiber: lookup.get("fiber"),
    salt: lookup.get("salt"),
  };
  const normalized = normalizeNutrients(raw);
  if (kcalDirect === null && normalized.energySource === "provided") {
    // The value came from kJ, not from a kcal field.
    return { ...normalized, energySource: "calculated" };
  }
  return normalized;
}

interface OffInputSet {
  per?: string;
  per_quantity?: number;
  per_unit?: string;
  source?: string;
  nutrients?: Record<string, unknown>;
}

/**
 * Packaging sets are read from label photos and are often mis-read, with whole
 * rows shifted (a Nutella label became 30 g protein and 15 g salt per 100 g).
 * A per-100 g set whose components add up to more than 100 g, whose sugars beat
 * its carbohydrates or whose saturated fat beats its total fat cannot be real,
 * so it is dropped instead of being saved as the food's values.
 */
function isPlausibleSet(set: OffInputSet): boolean {
  const lookup = lookupFromNutrientMap(set.nutrients ?? {});
  const protein = lookup.get("proteins") ?? 0;
  const carbs = lookup.get("carbohydrates") ?? 0;
  const fat = lookup.get("fat") ?? 0;
  const fiber = lookup.get("fiber") ?? 0;
  const salt = lookup.get("salt") ?? 0;
  const sugars = lookup.get("sugars");
  const satFat = lookup.get("saturated-fat");
  if (protein + carbs + fat + fiber + salt > 105) return false;
  if (sugars !== null && sugars > carbs * 1.1 + 0.5) return false;
  if (satFat !== null && satFat > fat * 1.1 + 0.5) return false;
  return true;
}

function pickNutritionSet(
  inputSets: OffInputSet[],
): { basis: BasisType; nutrients: Nutrients; energySource: FoodCandidate["energySource"]; servingSize: number | null; servingUnit: "g" | "ml" | null } | null {
  const usable = inputSets.filter(
    (set) =>
      set &&
      set.nutrients &&
      typeof set.nutrients === "object" &&
      set.source !== "estimate" &&
      Number(set.per_quantity) > 0 &&
      isPlausibleSet(set),
  );
  const servingSet = usable.find(
    (set) =>
      set.per === "serving" &&
      (set.per_unit === "g" || set.per_unit === "ml"),
  );
  const servingSize =
    servingSet && numberValue(servingSet.per_quantity) !== null
      ? numberValue(servingSet.per_quantity)
      : null;
  const servingUnit =
    servingSet?.per_unit === "g" || servingSet?.per_unit === "ml"
      ? servingSet.per_unit
      : null;

  const hasMl = usable.some((set) => set.per === "100ml");
  const basis: BasisType = hasMl ? "100ml" : "100g";
  const per100 = usable.filter(
    (set) =>
      (set.per === "100g" || set.per === "100ml") &&
      (basis === "100ml" ? set.per === "100ml" : set.per === "100g"),
  );
  // Manufacturer values are curated from the producer's own data; packaging
  // values come from OCR of the printed table and are the usual source of
  // garbled rows, so they are only a fallback.
  const sourcePriority: Record<string, number> = {
    manufacturer: 0,
    packaging: 1,
  };
  per100.sort(
    (a, b) =>
      (sourcePriority[a.source ?? ""] ?? 2) -
      (sourcePriority[b.source ?? ""] ?? 2),
  );
  const selected = per100[0];
  if (selected) {
    const result = nutrientsFromLookup(
      lookupFromNutrientMap(selected.nutrients ?? {}),
    );
    if (hasKnownNutrient(result.nutrients)) {
      return {
        basis,
        nutrients: result.nutrients,
        energySource: result.energySource,
        servingSize,
        servingUnit,
      };
    }
  }

  if (servingSet) {
    const result = nutrientsFromLookup(
      lookupFromNutrientMap(servingSet.nutrients ?? {}),
    );
    if (hasKnownNutrient(result.nutrients)) {
      return {
        basis: "serving",
        nutrients: result.nutrients,
        energySource: result.energySource,
        servingSize,
        servingUnit,
      };
    }
  }
  return null;
}

export function normalizeOffProduct(raw: Record<string, unknown>): FoodCandidate {
  const code = textValue(raw.code);
  const name = productName(raw);
  if (!name || !code) {
    throw new FoodApiError("invalid", "The product record has no usable name.");
  }
  const quantity = textValue(raw.quantity);
  const nutrition = raw.nutrition;
  const inputSets =
    nutrition && typeof nutrition === "object"
      ? ((nutrition as { input_sets?: OffInputSet[] }).input_sets ?? [])
      : [];
  const picked = pickNutritionSet(inputSets);
  if (!picked) {
    // Legacy products can still expose the flat nutriments object.
    const legacy =
      raw.nutriments && typeof raw.nutriments === "object"
        ? (raw.nutriments as Record<string, unknown>)
        : null;
    if (legacy && Object.keys(legacy).length > 0) {
      const basis: BasisType = unitFromQuantity(quantity) === "ml" ? "100ml" : "100g";
      const result = nutrientsFromLookup(lookupFromLegacyNutriments(legacy));
      if (!hasKnownNutrient(result.nutrients)) {
        throw new FoodApiError("no-data", "No nutrition data is available for this product.");
      }
      return {
        source: "off",
        externalId: code,
        barcode: code,
        name,
        brand: textValue(raw.brands),
        basisType: basis,
        servingSize: null,
        servingUnit: null,
        nutrients: result.nutrients,
        energySource: result.energySource,
        imageUrl: imageValue(raw),
        ...catalogFields(raw, name),
      };
    }
    throw new FoodApiError("no-data", "No nutrition data is available for this product.");
  }

  return {
    source: "off",
    externalId: code,
    barcode: code,
    name,
    brand: textValue(raw.brands),
    basisType: picked.basis,
    servingSize: picked.servingSize,
    servingUnit: picked.servingUnit,
    nutrients: picked.nutrients,
    energySource: picked.energySource,
    imageUrl: imageValue(raw),
    ...catalogFields(raw, name),
  };
}

export function normalizeOffSearchHit(hit: Record<string, unknown>): FoodCandidate | null {
  const code = textValue(hit.code);
  const name = productName(hit);
  if (!name || !code) return null;
  const nutriments =
    hit.nutriments && typeof hit.nutriments === "object"
      ? (hit.nutriments as Record<string, unknown>)
      : {};
  if (Object.keys(nutriments).length === 0) return null;
  const quantity = textValue(hit.quantity);
  const basis: BasisType = unitFromQuantity(quantity) === "ml" ? "100ml" : "100g";
  const result = nutrientsFromLookup(lookupFromLegacyNutriments(nutriments));
  if (!hasKnownNutrient(result.nutrients)) return null;
  return {
    source: "off",
    externalId: code,
    barcode: code,
    name,
    brand: textValue(hit.brands),
    basisType: basis,
    servingSize: null,
    servingUnit: null,
    nutrients: result.nutrients,
    energySource: result.energySource,
    imageUrl: imageValue(hit),
    ...catalogFields(hit, name),
  };
}

// Open Food Facts answers with a 5xx HTML page now and then when its nodes are
// busy. Those requests are worth repeating; a 429 means slow down and is not.
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function retryDelay(attempt: number): Promise<void> {
  // Short, growing pause with a little jitter so retries do not synchronise.
  const ms = attempt * 250 + Math.random() * 150;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(
  url: string,
  options?: { notFoundIsMiss?: boolean },
): Promise<unknown> {
  let lastError: FoodApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: headers(),
        signal: AbortSignal.timeout(9_000),
        next: { revalidate: 600 },
      });
    } catch {
      lastError = new FoodApiError(
        "unavailable",
        "Open Food Facts could not be reached.",
      );
      if (attempt < MAX_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      throw lastError;
    }

    if (RETRYABLE_STATUSES.has(response.status)) {
      lastError = new FoodApiError(
        "unavailable",
        "The food database is unavailable.",
      );
      if (attempt < MAX_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      throw lastError;
    }
    if (response.status === 429) {
      throw new FoodApiError(
        "rate-limited",
        "The food database is rate limiting requests.",
      );
    }
    if (response.status === 404 && options?.notFoundIsMiss) {
      throw new FoodApiError("not-found", "Product not found.");
    }
    if (!response.ok) {
      throw new FoodApiError("unavailable", "The food database is unavailable.");
    }
    try {
      return await response.json();
    } catch {
      throw new FoodApiError(
        "invalid",
        "The food database returned malformed data.",
      );
    }
  }

  throw (
    lastError ??
    new FoodApiError("unavailable", "The food database is unavailable.")
  );
}

function normalizeQuery(query: string): string {
  return query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function countryPriority(hit: Record<string, unknown>): number {
  const tags = Array.isArray(hit.countries_tags) ? hit.countries_tags : [];
  if (tags.some((tag) => tag === "en:slovakia" || tag === "en:czechia")) return 0;
  return 1;
}

export async function searchOpenFoodFacts(query: string): Promise<FoodCandidate[]> {
  const perform = async (text: string): Promise<FoodCandidate[]> => {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", text);
    url.searchParams.set("page_size", "24");
    url.searchParams.set("fields", SEARCH_FIELDS);
    const payload = await requestJson(url.toString());
    if (!payload || typeof payload !== "object") return [];
    const hits = (payload as { hits?: unknown }).hits;
    if (!Array.isArray(hits)) return [];
    const withOrder: Array<{
      hit: Record<string, unknown>;
      index: number;
      candidate: FoodCandidate | null;
    }> = [];
    hits.forEach((hit, index) => {
      if (!hit || typeof hit !== "object") return;
      const record = hit as Record<string, unknown>;
      withOrder.push({
        hit: record,
        index,
        candidate: normalizeOffSearchHit(record),
      });
    });
    withOrder.sort((a, b) => {
      const priority = countryPriority(a.hit) - countryPriority(b.hit);
      return priority !== 0 ? priority : a.index - b.index;
    });
    const seen = new Set<string>();
    const results: FoodCandidate[] = [];
    for (const item of withOrder) {
      const candidate = item.candidate;
      if (!candidate || seen.has(candidate.externalId ?? "")) continue;
      seen.add(candidate.externalId ?? "");
      results.push(candidate);
      if (results.length >= 12) break;
    }
    return results;
  };

  const results = await perform(query);
  if (results.length > 0) return results;
  const ascii = normalizeQuery(query);
  if (ascii !== query && ascii.trim().length >= 2) {
    return perform(ascii);
  }
  return [];
}

export async function fetchOpenFoodFactsProduct(
  barcode: string,
): Promise<FoodCandidate> {
  const fields = [
    "nutrition",
    "code",
    "product_name",
    "product_name_sk",
    "product_name_cs",
    "brands",
    "quantity",
    "product_quantity",
    "product_quantity_unit",
    "image_front_small_url",
    "image_front_url",
    "image_url",
  ].join(",");
  const url = `${PRODUCT_URL}/${encodeURIComponent(barcode)}?fields=${fields}`;
  try {
    const payload = await requestJson(url, { notFoundIsMiss: true });
    const product =
      payload && typeof payload === "object"
        ? (payload as { product?: unknown }).product
        : null;
    if (product && typeof product === "object") {
      return normalizeOffProduct(product as Record<string, unknown>);
    }
    throw new FoodApiError("not-found", "Product not found.");
  } catch (error) {
    if (
      error instanceof FoodApiError &&
      (error.kind === "not-found" || error.kind === "no-data" || error.kind === "invalid")
    ) {
      // Older records remain available through the supported v2 endpoint.
      const legacyUrl = `${LEGACY_PRODUCT_URL}/${encodeURIComponent(
        barcode,
      )}.json?fields=code,product_name,brands,quantity,serving_size,nutriments,image_front_small_url,image_front_url,image_url`;
      try {
        const legacy = await requestJson(legacyUrl, { notFoundIsMiss: true });
        const product =
          legacy && typeof legacy === "object"
            ? (legacy as { product?: unknown }).product
            : null;
        if (product && typeof product === "object") {
          return normalizeOffProduct(product as Record<string, unknown>);
        }
      } catch {
        // Preserve the more useful original error below.
      }
      throw error;
    }
    throw error;
  }
}

export function missingNutrientKeys(nutrients: Nutrients): NutrientKey[] {
  return (Object.keys(nutrients) as NutrientKey[]).filter(
    (key) => nutrients[key] === null,
  );
}
