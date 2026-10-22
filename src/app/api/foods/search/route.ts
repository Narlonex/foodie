import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import {
  FoodApiError,
  searchOpenFoodFacts,
} from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, searchUsda } from "@/lib/foods/usda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return errorResponse("error.unauthorised", 401);

  const { searchParams } = request.nextUrl;
  const query = (searchParams.get("q") ?? "").trim();
  const source = searchParams.get("source") === "usda" ? "usda" : "off";
  if (query.length < 2) return errorResponse("search.minChars", 400);
  if (query.length > 80) return errorResponse("search.error", 400);

  if (source === "usda" && !isUsdaEnabled()) {
    return errorResponse("search.usdaNotConfigured", 501);
  }
  if (source === "usda" && !viewer.profile.usdaEnabled) {
    return errorResponse("search.usdaDisabled", 403);
  }

  try {
    const results =
      source === "usda"
        ? await searchUsda(query)
        : await searchOpenFoodFacts(query);
    return NextResponse.json(
      { results, source },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof FoodApiError) {
      if (error.kind === "rate-limited") {
        return errorResponse("food.rateLimited", 429);
      }
      if (error.kind === "invalid") {
        return errorResponse("food.invalid", 502);
      }
      if (error.kind === "not-found" || error.kind === "no-data") {
        return errorResponse("food.noData", 404);
      }
    }
    return errorResponse("food.apiError", 503);
  }
}
