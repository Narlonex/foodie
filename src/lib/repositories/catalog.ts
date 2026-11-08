import "server-only";
import { query, queryOne } from "../db";
import { normalizeFoodName } from "../foods/merge";
import type { FoodCandidate } from "../types";

export type CatalogSource = "off" | "usda" | "both";

export interface CatalogSearchOptions {
  category?: string | null;
  verifiedOnly?: boolean;
  offset?: number;
  /** "protein" ranks by protein per kcal, "light" by lowest energy. */
  sort?: "protein" | "light" | null;
}

export interface CatalogFacet {
  category: string;
  count: number;
}

export interface CatalogSearchMiss {
  id: string;
  query: string;
  resultsCount: number;
  hits: number;
  lastSeenAt: string;
}

interface CatalogRow {
  source: "off" | "usda";
  external_id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string;
  image_url: string | null;
  basis_type: "100g" | "100ml" | "serving";
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
  energy_source: "provided" | "calculated" | "unknown";
  preparation: "raw" | "cooked" | "unspecified";
  package_quantity: string | number | null;
  package_unit: "g" | "ml" | null;
  drained_weight: string | number | null;
  verified: boolean;
}

interface CatalogMissRow {
  id: string;
  query: string;
  results_count: number;
  hits: number;
  last_seen_at: string | Date;
}

const CATALOG_COLUMNS = `
  source, external_id, barcode, name, brand, category, image_url,
  basis_type, serving_size, serving_unit, kcal, kj, protein_g, carbs_g,
  sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, energy_source, preparation,
  package_quantity, package_unit, drained_weight, verified
`;

function numberValue(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapCatalogFood(row: CatalogRow): FoodCandidate {
  return {
    source: row.source,
    externalId: row.external_id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    category: row.category,
    verified: row.verified,
    basisType: row.basis_type,
    servingSize: numberValue(row.serving_size),
    servingUnit: row.serving_unit,
    nutrients: {
      kcal: numberValue(row.kcal),
      kj: numberValue(row.kj),
      protein: numberValue(row.protein_g),
      carbs: numberValue(row.carbs_g),
      sugars: numberValue(row.sugars_g),
      fat: numberValue(row.fat_g),
      satFat: numberValue(row.sat_fat_g),
      fiber: numberValue(row.fiber_g),
      salt: numberValue(row.salt_g),
    },
    energySource: row.energy_source,
    imageUrl: row.image_url,
    preparation: row.preparation,
    packageQuantity: numberValue(row.package_quantity),
    packageUnit: row.package_unit,
    drainedWeight: numberValue(row.drained_weight),
    catalog: true,
  };
}

/**
 * Searches the local catalog with trigram + full-text indexes. Category-only
 * browsing is supported so households can quickly inspect what is available
 * without having to type a query first.
 */
export async function searchCatalogFoods(
  queryText: string,
  source: CatalogSource,
  limit = 40,
  options: CatalogSearchOptions = {},
): Promise<FoodCandidate[]> {
  const normalized = normalizeFoodName(queryText);
  const hasQuery = normalized.length >= 2;
  const category = options.category?.trim() || null;
  if (!hasQuery && !category) return [];

  const params: Array<string | number> = [normalized];
  const conditions: string[] = [];

  if (hasQuery) {
    conditions.push(`(
      search_vector @@ websearch_to_tsquery('simple', $1::text)
      OR search_text LIKE '%' || $1::text || '%'
      OR EXISTS (
        SELECT 1 FROM catalog_aliases a
         WHERE a.catalog_food_id = catalog_foods.id
           AND a.normalized_alias LIKE '%' || $1::text || '%'
      )
    )`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (options.verifiedOnly) conditions.push("verified = true");
  if (source !== "both") {
    params.push(source);
    conditions.push(`source = $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const safeOffset = Math.max(Math.trunc(options.offset ?? 0), 0);
  params.push(safeLimit, safeOffset);

  // Gym use-cases dominate the search: "protein" sorts by protein density
  // (grams per kcal, so a 350 kcal bar cannot outrank lean meat), "light"
  // surfaces the lowest-energy options. Everything else keeps relevance.
  const orderBy =
    options.sort === "protein"
      ? `(protein_g / NULLIF(kcal, 0)) DESC NULLS LAST,
         verified DESC,
         completeness DESC,
         length(name),
         name`
      : options.sort === "light"
        ? `kcal ASC NULLS LAST,
           verified DESC,
           completeness DESC,
           length(name),
           name`
        : `CASE
             WHEN $1 <> '' AND normalized_name = $1::text THEN 0
             WHEN $1 <> '' AND normalized_name LIKE $1::text || '%' THEN 1
             WHEN $1 <> '' AND normalized_name LIKE '% ' || $1::text || '%' THEN 2
             ELSE 3
           END,
           ts_rank_cd(
             search_vector,
             websearch_to_tsquery('simple', $1::text)
           ) DESC,
           similarity(normalized_name, $1::text) DESC,
           verified DESC,
           completeness DESC,
           length(name),
           name`;

  const rows = await query<CatalogRow>(
    `SELECT ${CATALOG_COLUMNS}
       FROM catalog_foods
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(mapCatalogFood);
}

export async function getCatalogFoodByBarcode(
  barcode: string,
): Promise<FoodCandidate | null> {
  const row = await queryOne<CatalogRow>(
    `SELECT ${CATALOG_COLUMNS}
       FROM catalog_foods
      WHERE barcode = $1
      ORDER BY verified DESC, completeness DESC, length(name), name
      LIMIT 1`,
    [barcode],
  );
  return row ? mapCatalogFood(row) : null;
}

export async function countCatalogFoods(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM catalog_foods",
  );
  return row ? Number(row.count) : 0;
}

export async function getCatalogFacets(): Promise<CatalogFacet[]> {
  const rows = await query<{ category: string; count: string }>(
    `SELECT category, count(*)::text AS count
       FROM catalog_foods
      GROUP BY category
      ORDER BY count(*) DESC, category`,
  );
  return rows.map((row) => ({
    category: row.category,
    count: Number(row.count),
  }));
}

export async function getCatalogStats(): Promise<{
  total: number;
  verified: number;
  categories: number;
}> {
  const row = await queryOne<{
    total: string;
    verified: string;
    categories: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE verified)::text AS verified,
            count(DISTINCT category)::text AS categories
       FROM catalog_foods`,
  );
  return {
    total: row ? Number(row.total) : 0,
    verified: row ? Number(row.verified) : 0,
    categories: row ? Number(row.categories) : 0,
  };
}

/** Aggregated, userless signal for the admin missing-food radar. */
export async function recordCatalogSearchMiss(
  queryText: string,
): Promise<void> {
  const query = queryText.trim();
  const normalized = normalizeFoodName(query);
  if (normalized.length < 2 || query.length > 80) return;

  await queryOne(
    `INSERT INTO catalog_search_misses
       (query, normalized_query, results_count, hits)
     VALUES ($1, $2, 0, 1)
     ON CONFLICT (normalized_query) DO UPDATE SET
       query = EXCLUDED.query,
       hits = catalog_search_misses.hits + 1,
       last_seen_at = now()`,
    [query.slice(0, 80), normalized],
  );
}

export async function listCatalogSearchMisses(
  limit = 40,
): Promise<CatalogSearchMiss[]> {
  const rows = await query<CatalogMissRow>(
    `SELECT id, query, results_count, hits, last_seen_at
       FROM catalog_search_misses
      ORDER BY last_seen_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    resultsCount: row.results_count,
    hits: row.hits,
    lastSeenAt:
      row.last_seen_at instanceof Date
        ? row.last_seen_at.toISOString()
        : String(row.last_seen_at),
  }));
}

/**
 * Data-quality counters for the admin dashboard. A food without energy or
 * macros can still be logged, but its totals stay partial, so the numbers are
 * worth watching while the catalog grows.
 */
export async function getCatalogQuality(): Promise<{
  missingKcal: number;
  missingMacros: number;
  duplicateBarcodes: number;
}> {
  const row = await queryOne<{
    missing_kcal: string;
    missing_macros: string;
    duplicate_barcodes: string;
  }>(
    `SELECT count(*) FILTER (WHERE kcal IS NULL)::text AS missing_kcal,
            count(*) FILTER (
              WHERE protein_g IS NULL OR carbs_g IS NULL OR fat_g IS NULL
            )::text AS missing_macros,
            (
              SELECT count(*)::text
                FROM (
                  SELECT barcode
                    FROM catalog_foods
                   WHERE barcode IS NOT NULL
                   GROUP BY barcode
                  HAVING count(*) > 1
                ) AS duplicates
            ) AS duplicate_barcodes
       FROM catalog_foods`,
  );
  return {
    missingKcal: row ? Number(row.missing_kcal) : 0,
    missingMacros: row ? Number(row.missing_macros) : 0,
    duplicateBarcodes: row ? Number(row.duplicate_barcodes) : 0,
  };
}
