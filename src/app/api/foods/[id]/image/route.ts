import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { getFoodImage } from "@/lib/repositories/foods";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const image = await getFoodImage(viewer.user.id, id);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
