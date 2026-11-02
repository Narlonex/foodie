import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { exportDiaryCsv, exportUserData } from "@/lib/repositories/export";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format");
  const data = await exportUserData(viewer.user.id, viewer.user.email);
  const date = data.exportedAt.slice(0, 10);

  if (format === "csv") {
    return new NextResponse(exportDiaryCsv(data), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="foodie-diary-${date}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="foodie-export-${date}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
