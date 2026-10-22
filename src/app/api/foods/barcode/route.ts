import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import {
  fetchOpenFoodFactsProduct,
  FoodApiError,
} from "@/lib/foods/openFoodFacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    return response({ food }, 200);
  } catch (error) {
    if (error instanceof FoodApiError) {
      if (error.kind === "not-found") {
        return response({ error: "search.barcodeNotFound" }, 404);
      }
      if (error.kind === "no-data") {
        return response({ error: "food.noData" }, 404);
      }
      if (error.kind === "rate-limited") {
        return response({ error: "food.rateLimited" }, 429);
      }
      if (error.kind === "invalid") {
        return response({ error: "food.invalid" }, 502);
      }
    }
    return response({ error: "food.apiError" }, 503);
  }
}
