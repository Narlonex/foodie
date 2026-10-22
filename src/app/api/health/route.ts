import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { status: "error", database: "not_configured" },
      { status: 503, headers },
    );
  }
  try {
    await query("SELECT 1 AS ok");
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        timestamp: new Date().toISOString(),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers },
    );
  }
}
