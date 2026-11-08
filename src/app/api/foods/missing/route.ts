import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { recordCatalogSearchMiss } from "@/lib/repositories/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: "error.unauthorised" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { q?: unknown };
  const query = typeof body.q === "string" ? body.q.trim() : "";
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json(
      { error: "search.minChars" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  await recordCatalogSearchMiss(query).catch(() => undefined);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
