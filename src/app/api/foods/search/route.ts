import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { FoodApiError, searchOpenFoodFacts } from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, searchUsda } from "@/lib/foods/usda";
import { mergeSearchResults } from "@/lib/foods/merge";
import type { FoodCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SourceKind = "off" | "usda";
type SearchSource = SourceKind | "both";

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
): Promise<SourceOutcome> {
  try {
    const results =
      kind === "usda" ? await searchUsda(query) : await searchOpenFoodFacts(query);
    return { ok: true, kind, results };
  } catch (error) {
    return { ok: false, kind, ...describeError(error) };
  }
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return errorResponse("error.unauthorised", 401);

  const { searchParams } = request.nextUrl;
  const query = (searchParams.get("q") ?? "").trim();
  const source = parseSource(searchParams.get("source"));
  if (query.length < 2) return errorResponse("search.minChars", 400);
  if (query.length > 80) return errorResponse("search.error", 400);

  if (source === "usda" && !isUsdaEnabled()) {
    return errorResponse("search.usdaNotConfigured", 501);
  }
  if (source === "usda" && !viewer.profile.usdaEnabled) {
    return errorResponse("search.usdaDisabled", 403);
  }

  if (source !== "both") {
    const outcome = await loadSource(source, query);
    if (!outcome.ok) return errorResponse(outcome.error, outcome.status);
    return NextResponse.json(
      { results: outcome.results, source },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // "Both" queries every configured database at once. A dead provider must not
  // take the usable one down with it, so each call settles on its own.
  const usdaAllowed = isUsdaEnabled() && viewer.profile.usdaEnabled;
  const outcomes = await Promise.all([
    loadSource("off", query),
    ...(usdaAllowed ? [loadSource("usda", query)] : []),
  ]);

  const succeeded = outcomes.filter(
    (outcome): outcome is Extract<SourceOutcome, { ok: true }> => outcome.ok,
  );
  const failed = outcomes.filter(
    (outcome): outcome is Extract<SourceOutcome, { ok: false }> => !outcome.ok,
  );

  if (succeeded.length === 0) {
    // Throttling is the one failure the user can act on, so it wins over the
    // generic "unavailable" a different database may have reported.
    const reported =
      failed.find((outcome) => outcome.status === 429) ?? failed[0];
    return reported
      ? errorResponse(reported.error, reported.status)
      : errorResponse("food.apiError", 503);
  }

  const off = succeeded.find((outcome) => outcome.kind === "off");
  const usda = succeeded.find((outcome) => outcome.kind === "usda");
  const results = mergeSearchResults(off?.results ?? [], usda?.results ?? [], query);

  return NextResponse.json(
    {
      results,
      source,
      unavailable: failed.map((outcome) => outcome.kind),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
