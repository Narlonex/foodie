import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { FoodApiError, searchOpenFoodFacts } from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, searchUsda } from "@/lib/foods/usda";
import { mergeSearchResults } from "@/lib/foods/merge";
import {
  recordCatalogSearchMiss,
  searchCatalogFoods,
} from "@/lib/repositories/catalog";
import type { FoodCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SourceKind = "off" | "usda";
type SearchSource = SourceKind | "both";

const SOURCE_RESULT_LIMIT: Record<SourceKind, number> = { off: 30, usda: 24 };
const CATALOG_RESULT_LIMIT = 40;

type SourceOutcome =
  | { ok: true; kind: SourceKind; results: FoodCandidate[] }
  | { ok: false; kind: SourceKind; error: string; status: number };

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function parseSource(value: string | null): SearchSource {
  if (value === "usda") return "usda";
  if (value === "both") return "both";
  return "off";
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 1;
}

function sourceHasMore(outcome: Extract<SourceOutcome, { ok: true }>): boolean {
  return outcome.results.length >= SOURCE_RESULT_LIMIT[outcome.kind];
}

async function loadCatalog(
  query: string,
  source: SearchSource,
  page: number,
  category: string | null,
  verifiedOnly: boolean,
  sort: "protein" | "light" | null,
): Promise<FoodCandidate[]> {
  try {
    return await searchCatalogFoods(query, source, CATALOG_RESULT_LIMIT, {
      category,
      verifiedOnly,
      sort,
      offset: (page - 1) * CATALOG_RESULT_LIMIT,
    });
  } catch {
    // A missing/unavailable catalog must not take external search down.
    return [];
  }
}

function describeError(error: unknown): { error: string; status: number } {
  if (error instanceof FoodApiError) {
    if (error.kind === "rate-limited") {
      return { error: "food.rateLimited", status: 429 };
    }
    if (error.kind === "invalid") {
      return { error: "food.invalid", status: 502 };
    }
    if (error.kind === "not-found" || error.kind === "no-data") {
      return { error: "food.noData", status: 404 };
    }
  }
  return { error: "food.apiError", status: 503 };
}

async function loadSource(
  kind: SourceKind,
  query: string,
  page: number,
): Promise<SourceOutcome> {
  try {
    const results =
      kind === "usda"
        ? await searchUsda(query, page)
        : await searchOpenFoodFacts(query, page);
    return { ok: true, kind, results };
  } catch (error) {
    return { ok: false, kind, ...describeError(error) };
  }
}

function emptyOutcome(kind: SourceKind): SourceOutcome {
  return { ok: true, kind, results: [] };
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return errorResponse("error.unauthorised", 401);

  const { searchParams } = request.nextUrl;
  const query = (searchParams.get("q") ?? "").trim();
  const source = parseSource(searchParams.get("source"));
  const page = parsePage(searchParams.get("page"));
  const rawCategory = (searchParams.get("category") ?? "").trim();
  const category =
    rawCategory && /^[a-z0-9-]{2,40}$/.test(rawCategory)
      ? rawCategory
      : null;
  const verifiedOnly = searchParams.get("verified") === "1";
  const rawSort = searchParams.get("sort");
  const sort = rawSort === "protein" || rawSort === "light" ? rawSort : null;

  if (rawCategory && !category) return errorResponse("search.error", 400);
  if (query.length < 2 && !category) {
    return errorResponse("search.minChars", 400);
  }
  if (query.length > 80) return errorResponse("search.error", 400);

  const externalAllowed = query.length >= 2;
  if (externalAllowed && source === "usda" && !isUsdaEnabled()) {
    return errorResponse("search.usdaNotConfigured", 501);
  }
  if (externalAllowed && source === "usda" && !viewer.profile.usdaEnabled) {
    return errorResponse("search.usdaDisabled", 403);
  }

  const [catalogResults, ...outcomes] = await Promise.all([
    loadCatalog(query, source, page, category, verifiedOnly, sort),
    ...(source !== "both"
      ? [
          externalAllowed
            ? loadSource(source, query, page)
            : Promise.resolve(emptyOutcome(source)),
        ]
      : [
          externalAllowed
            ? loadSource("off", query, page)
            : Promise.resolve(emptyOutcome("off")),
          externalAllowed && viewer.profile.usdaEnabled && isUsdaEnabled()
            ? loadSource("usda", query, page)
            : Promise.resolve(emptyOutcome("usda")),
        ]),
  ]);

  const succeeded = outcomes.filter(
    (outcome): outcome is Extract<SourceOutcome, { ok: true }> => outcome.ok,
  );
  const failed = outcomes.filter(
    (outcome): outcome is Extract<SourceOutcome, { ok: false }> => !outcome.ok,
  );

  if (succeeded.length === 0 && catalogResults.length === 0) {
    if (!externalAllowed) {
      return errorResponse("food.apiError", 503);
    }
    const reported =
      failed.find((outcome) => outcome.status === 429) ?? failed[0];
    return reported
      ? errorResponse(reported.error, reported.status)
      : errorResponse("food.apiError", 503);
  }

  const off = succeeded.find((outcome) => outcome.kind === "off");
  const usda = succeeded.find((outcome) => outcome.kind === "usda");
  // A sorted view is a catalog view: merging external sources would re-rank by
  // text relevance and silently break "most protein per kcal".
  const results = sort
    ? catalogResults
    : mergeSearchResults(
        [...catalogResults, ...(off?.results ?? [])],
        usda?.results ?? [],
        query,
        CATALOG_RESULT_LIMIT,
      );

  if (!sort && results.length === 0 && page === 1 && externalAllowed) {
    await recordCatalogSearchMiss(query).catch(() => undefined);
  }

  return NextResponse.json(
    {
      results,
      source,
      page,
      hasMore:
        catalogResults.length >= CATALOG_RESULT_LIMIT ||
        succeeded.some(sourceHasMore),
      unavailable: failed.map((outcome) => outcome.kind),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
