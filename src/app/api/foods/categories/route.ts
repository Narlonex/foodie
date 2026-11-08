import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { getCatalogFacets } from "@/lib/repositories/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: "error.unauthorised" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const categories = await getCatalogFacets();
    return NextResponse.json(
      { categories },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { categories: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
