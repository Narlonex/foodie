import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import {
  fetchOpenFoodFactsProduct,
  FoodApiError,
} from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, lookupUsdaBarcode } from "@/lib/foods/usda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

interface LookupFailure {
  error: string;
  status: number;
  notFound: boolean;
}

function describeFailure(error: unknown): LookupFailure {
  if (error instanceof FoodApiError) {
    if (error.kind === "not-found") {
      return { error: "search.barcodeNotFound", status: 404, notFound: true };
    }
    if (error.kind === "no-data") {
      return { error: "food.noData", status: 404, notFound: true };
    }
    if (error.kind === "rate-limited") {
      return { error: "food.rateLimited", status: 429, notFound: false };
    }
    if (error.kind === "invalid") {
      return { error: "food.invalid", status: 502, notFound: false };
    }
  }
  return { error: "food.apiError", status: 503, notFound: false };
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return response({ error: "error.unauthorised" }, 401);

  const code = (request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!/^[0-9]{6,20}$/.test(code)) {
    return response({ error: "search.invalidBarcode" }, 400);
  }

  try {
    const food = await fetchOpenFoodFactsProduct(code);
    return response({ food, source: food.source }, 200);
  } catch (error) {
    const offFailure = describeFailure(error);

    // Open Food Facts covers most European packages but has gaps. USDA's
    // branded records carry GTIN/UPC codes, so a scan that misses there is
    // tried against the second configured database before giving up.
    if (isUsdaEnabled() && viewer.profile.usdaEnabled) {
      try {
        const food = await lookupUsdaBarcode(code);
        return response({ food, source: food.source }, 200);
      } catch (usdaError) {
        const usdaFailure = describeFailure(usdaError);
        if (usdaFailure.status === 429) {
          return response({ error: usdaFailure.error }, 429);
        }
        if (offFailure.status === 429) {
          return response({ error: offFailure.error }, 429);
        }
        // Only a miss in both databases becomes a 404, which is what unlocks
        // "create this food from the label". If one source is down we must not
        // claim the product does not exist.
        if (offFailure.notFound && usdaFailure.notFound) {
          return response({ error: "search.barcodeNotFound" }, 404);
        }
        if (offFailure.notFound) {
          return response({ error: usdaFailure.error }, usdaFailure.status);
        }
        return response({ error: offFailure.error }, offFailure.status);
      }
    }

    return response({ error: offFailure.error }, offFailure.status);
  }
}
