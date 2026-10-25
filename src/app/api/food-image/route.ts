import { type NextRequest, NextResponse } from "next/server";
import {
  fallbackFoodImage,
  findFoodImageUrl,
} from "@/lib/foods/foodImage";

export const dynamic = "force-dynamic";

const IMAGE_CACHE = "public, max-age=86400, s-maxage=604800";

function svgResponse(name: string): NextResponse {
  return new NextResponse(fallbackFoodImage(name), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // The tile is a miss, not a result: keep it out of the browser cache so
      // a later lookup for the same food can still show a real photo.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Resolves a food name to a picture. External photos are returned as a
 * redirect so the browser caches them directly; when nothing is found (or the
 * network is unavailable) a generated tile keeps the UI complete.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const name = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (name.length < 2) return svgResponse("?");

  const url = await findFoodImageUrl(name);
  if (!url) return svgResponse(name);

  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", IMAGE_CACHE);
  return response;
}
