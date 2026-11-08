#!/usr/bin/env node
/**
 * Imports a practical regional seed from Open Food Facts into catalog_foods.
 *
 * The app still queries OFF/USDA live for the long tail. This catalog makes
 * common foods fast, searchable in Slovak/Czech, and available when a provider
 * is temporarily down. No nutrition values are invented here.
 *
 * Usage:
 *   npm run db:seed:foods
 *   CATALOG_PAGES=2 npm run db:seed:foods
 */
import process from "node:process";
import pg from "pg";

const SEARCH_URL = "https://search.openfoodfacts.org/search";
const PAGE_SIZE = 100;
const PAGES = Math.max(
  1,
  Math.min(3, Number(process.env.CATALOG_PAGES ?? "1") || 1),
);
const CONCURRENCY = 4;
const USER_AGENT =
  process.env.OFF_USER_AGENT ?? "Foodie/1.0 (catalog importer)";

const QUERIES = [
  ["chicken breast", "meat", ["chicken", "kuracie prsia", "kuřecí prsa"]],
  ["chicken thigh", "meat", ["chicken thigh", "kuracie stehno", "kuřecí stehno"]],
  ["turkey", "meat", ["turkey", "morka", "krůta"]],
  ["beef", "meat", ["beef", "hovädzie", "hovězí", "steak"]],
  ["pork", "meat", ["pork", "bravčové", "vepřové"]],
  ["ham", "meat", ["ham", "šunka", "szynka"]],
  ["sausage", "meat", ["sausage", "klobása", "párek"]],
  ["bacon", "meat", ["bacon", "slanina", "anglická slanina"]],
  ["salmon", "fish", ["salmon", "losos", "somon"]],
  ["tuna", "fish", ["tuna", "tuniak", "tuňák"]],
  ["cod", "fish", ["cod", "treska", "dorsz"]],
  ["eggs", "eggs", ["eggs", "vajcia", "vejce"]],
  ["milk", "dairy", ["milk", "mlieko", "mléko"]],
  ["yogurt", "dairy", ["yogurt", "jogurt"]],
  ["skyr", "dairy", ["skyr"]],
  ["cottage cheese", "dairy", ["cottage cheese", "tvaroh"]],
  ["cheese", "dairy", ["cheese", "syr", "sýr"]],
  ["mozzarella", "dairy", ["mozzarella"]],
  ["butter", "dairy", ["butter", "maslo", "máslo"]],
  ["cream", "dairy", ["cream", "smotana", "smetana"]],
  ["rice", "grains", ["rice", "ryža", "rýže"]],
  ["pasta", "grains", ["pasta", "cestoviny", "těstoviny"]],
  ["bread", "bakery", ["bread", "chlieb", "chléb"]],
  ["oats", "grains", ["oats", "ovos", "oves"]],
  ["flour", "grains", ["flour", "múka", "mouka"]],
  ["quinoa", "grains", ["quinoa"]],
  ["buckwheat", "grains", ["buckwheat", "pohánka", "pohanka"]],
  ["potato", "vegetables", ["potato", "zemiak", "brambor"]],
  ["tomato", "vegetables", ["tomato", "paradajka", "rajče"]],
  ["cucumber", "vegetables", ["cucumber", "uhorka", "okurka"]],
  ["bell pepper", "vegetables", ["pepper", "paprika", "papryka"]],
  ["onion", "vegetables", ["onion", "cibuľa", "cibule"]],
  ["carrot", "vegetables", ["carrot", "mrkva", "mrkev"]],
  ["broccoli", "vegetables", ["broccoli", "brokolica", "brokolice"]],
  ["spinach", "vegetables", ["spinach", "špenát"]],
  ["cabbage", "vegetables", ["cabbage", "kapusta", "zelí"]],
  ["zucchini", "vegetables", ["zucchini", "cuketa", "cuketa"]],
  ["mushroom", "vegetables", ["mushroom", "huby", "houby"]],
  ["peas", "vegetables", ["peas", "hrach", "hrách"]],
  ["corn", "vegetables", ["corn", "kukurica", "kukuřice"]],
  ["apple", "fruit", ["apple", "jablko"]],
  ["banana", "fruit", ["banana", "banán"]],
  ["orange", "fruit", ["orange", "pomaranč", "pomeranč"]],
  ["strawberry", "fruit", ["strawberry", "jahoda"]],
  ["blueberry", "fruit", ["blueberry", "čučoriedka", "borůvka"]],
  ["avocado", "fruit", ["avocado", "avokádo"]],
  ["grapes", "fruit", ["grapes", "hrozno", "hroznové víno"]],
  ["olive oil", "fats", ["olive oil", "olivový olej"]],
  ["almonds", "nuts", ["almonds", "mandle"]],
  ["walnuts", "nuts", ["walnuts", "vlašské orechy"]],
  ["peanut butter", "nuts", ["peanut butter", "arašidové maslo", "arašídové máslo"]],
  ["lentils", "legumes", ["lentils", "šošovica", "čočka"]],
  ["chickpeas", "legumes", ["chickpeas", "cícer", "cizrna"]],
  ["beans", "legumes", ["beans", "fazuľa", "fazole"]],
  ["tofu", "legumes", ["tofu"]],
  ["pizza", "prepared", ["pizza"]],
  ["chocolate", "snacks", ["chocolate", "čokoláda"]],
  ["ice cream", "snacks", ["ice cream", "zmrzlina"]],
  ["juice", "beverages", ["juice", "džús", "džus"]],
  ["coffee", "beverages", ["coffee", "káva"]],
  ["tea", "beverages", ["tea", "čaj"]],
  ["protein bar", "snacks", ["protein bar", "proteínová tyčinka", "proteinová tyčinka"]],
];

function textValue(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part) => typeof part === "string" && part.trim(),
    );
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function imageValue(hit) {
  for (const key of [
    "image_front_small_url",
    "image_front_url",
    "image_url",
  ]) {
    const value = textValue(hit[key]);
    if (value?.startsWith("https://")) return value;
  }
  return null;
}

function normalizeHit(hit, group) {
  const code = textValue(hit.code);
  const name =
    textValue(hit.product_name_sk) ??
    textValue(hit.product_name_cs) ??
    textValue(hit.product_name);
  if (!code || !name) return null;

  const nutriments =
    hit.nutriments && typeof hit.nutriments === "object"
      ? hit.nutriments
      : {};
  const get = (key) => numberValue(nutriments[`${key}_100g`]);
  const kcalDirect = get("energy-kcal");
  const kj = get("energy-kj") ?? get("energy");
  const kcal = kcalDirect ?? (kj === null ? null : kj / 4.184);
  const protein = get("proteins");
  const carbs = get("carbohydrates");
  const fat = get("fat");
  if (kcal === null || (protein === null && carbs === null && fat === null)) {
    return null;
  }

  const truncatedName = name.slice(0, 200);
  const brand = textValue(hit.brands)?.slice(0, 200) ?? null;
  return {
    source: "off",
    externalId: code,
    barcode: code,
    name: truncatedName,
    normalizedName: normalize(truncatedName),
    brand,
    category: group.category,
    searchTerms: new Set(group.terms),
    imageUrl: imageValue(hit),
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    kcal,
    kj,
    protein,
    carbs,
    sugars: get("sugars"),
    fat,
    satFat: get("saturated-fat"),
    fiber: get("fiber"),
    salt: get("salt"),
    energySource: kcalDirect !== null ? "provided" : "calculated",
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

async function fetchPage(query, page) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set(
    "fields",
    [
      "code",
      "product_name",
      "product_name_sk",
      "product_name_cs",
      "brands",
      "image_front_small_url",
      "image_front_url",
      "image_url",
      "nutriments",
    ].join(","),
  );

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 3) {
          await sleep(1_500 * attempt);
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload?.hits) ? payload.hits : [];
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(1_000 * attempt);
    }
  }
  return [];
}

async function main() {
  const startedAt = new Date();
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing. Put it in .env.local or export it.",
    );
  }

  const byCode = new Map();
  let fetched = 0;
  let failed = 0;
  let cursor = 0;
  const jobs = QUERIES.flatMap(([q, category, terms]) =>
    Array.from({ length: PAGES }, (_, index) => ({
      group: { q, category, terms },
      page: index + 1,
    })),
  );

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      try {
        const hits = await fetchPage(job.group.q, job.page);
        fetched += hits.length;
        for (const hit of hits) {
          const item = normalizeHit(hit, job.group);
          if (!item) continue;
          const existing = byCode.get(item.externalId);
          if (!existing) {
            byCode.set(item.externalId, item);
            continue;
          }
          for (const term of item.searchTerms) existing.searchTerms.add(term);
          if (existing.category === "other" && item.category !== "other") {
            existing.category = item.category;
          }
        }
        console.log(
          `fetched ${job.group.q} p${job.page}: ${hits.length} hits (${byCode.size} unique)`,
        );
      } catch (error) {
        failed += 1;
        console.log(
          `skip ${job.group.q} p${job.page}: ${error instanceof Error ? error.message : "request failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () =>
      worker(),
    ),
  );

  const items = [...byCode.values()].map((item) => {
    const searchText = normalize(
      [item.name, item.brand, item.category, [...item.searchTerms].join(" ")]
        .filter(Boolean)
        .join(" "),
    );
    return { ...item, searchText };
  });

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1|::1/.test(process.env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const table = await client.query(
      "SELECT to_regclass('public.catalog_foods') AS table_name",
    );
    if (!table.rows[0]?.table_name) {
      throw new Error("catalog_foods is missing; run npm run db:migrate first.");
    }

    let written = 0;
    await client.query("BEGIN");
    for (let offset = 0; offset < items.length; offset += 100) {
      const batch = items.slice(offset, offset + 100);
      const params = [];
      const values = batch.map((item, index) => {
        const base = index * 26;
        const row = [
          item.source,
          item.externalId,
          item.barcode,
          item.name,
          item.normalizedName,
          item.searchText,
          item.brand,
          item.category,
          item.basisType,
          item.servingSize,
          item.servingUnit,
          item.kcal,
          item.kj,
          item.protein,
          item.carbs,
          item.sugars,
          item.fat,
          item.satFat,
          item.fiber,
          item.salt,
          item.energySource,
          item.imageUrl,
          item.preparation,
          item.packageQuantity,
          item.packageUnit,
          item.drainedWeight,
        ];
        params.push(...row);
        return `(${row.map((_, i) => `$${base + i + 1}`).join(", ")}, now())`;
      });
      const inserted = await client.query(
        `INSERT INTO catalog_foods (
          source, external_id, barcode, name, normalized_name, search_text,
          brand, category, basis_type, serving_size, serving_unit, kcal, kj,
          protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g,
          energy_source, image_url, preparation, package_quantity, package_unit,
          drained_weight, updated_at
        ) VALUES ${values.join(", ")}
        ON CONFLICT (source, external_id) DO UPDATE SET
          barcode = EXCLUDED.barcode,
          name = EXCLUDED.name,
          normalized_name = EXCLUDED.normalized_name,
          search_text = EXCLUDED.search_text,
          brand = EXCLUDED.brand,
          category = EXCLUDED.category,
          basis_type = EXCLUDED.basis_type,
          serving_size = EXCLUDED.serving_size,
          serving_unit = EXCLUDED.serving_unit,
          kcal = EXCLUDED.kcal,
          kj = EXCLUDED.kj,
          protein_g = EXCLUDED.protein_g,
          carbs_g = EXCLUDED.carbs_g,
          sugars_g = EXCLUDED.sugars_g,
          fat_g = EXCLUDED.fat_g,
          sat_fat_g = EXCLUDED.sat_fat_g,
          fiber_g = EXCLUDED.fiber_g,
          salt_g = EXCLUDED.salt_g,
          energy_source = EXCLUDED.energy_source,
          image_url = EXCLUDED.image_url,
          preparation = EXCLUDED.preparation,
          package_quantity = EXCLUDED.package_quantity,
          package_unit = EXCLUDED.package_unit,
          drained_weight = EXCLUDED.drained_weight,
          updated_at = now()
        RETURNING id, external_id`,
        params,
      );
      const ids = new Map(
        inserted.rows.map((row) => [row.external_id, row.id]),
      );
      const aliasParams = [];
      const aliasValues = [];
      for (const item of batch) {
        const catalogId = ids.get(item.externalId);
        if (!catalogId) continue;
        for (const term of item.searchTerms) {
          const normalizedAlias = normalize(term);
          if (!normalizedAlias || normalizedAlias.length > 200) continue;
          const base = aliasParams.length;
          aliasParams.push(catalogId, term.slice(0, 200), normalizedAlias);
          aliasValues.push(
            `($${base + 1}, $${base + 2}, $${base + 3})`,
          );
        }
      }
      if (aliasValues.length > 0) {
        await client.query(
          `INSERT INTO catalog_aliases
             (catalog_food_id, alias, normalized_alias)
           VALUES ${aliasValues.join(", ")}
           ON CONFLICT (catalog_food_id, normalized_alias) DO NOTHING`,
          aliasParams,
        );
      }
      written += batch.length;
      console.log(`written ${written}/${items.length}`);
    }
    await client.query("COMMIT");
    await client.query(
      `INSERT INTO catalog_import_runs
         (source, started_at, finished_at, fetched, written, failed_queries, notes)
       VALUES ($1, $2, now(), $3, $4, $5, $6)`,
      [
        "openfoodfacts",
        startedAt,
        fetched,
        written,
        failed,
        `pages=${PAGES}`, 
      ],
    );
    console.log(
      `catalog import complete: fetched=${fetched} unique=${items.length} written=${written} failed_queries=${failed}`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
