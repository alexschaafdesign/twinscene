import { NextResponse, type NextRequest } from "next/server";
import { deleteShow } from "@/lib/shows";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: deletes a show outright. Called from /admin/review's "Delete"
// and "Keep this one" (merge) actions.
export async function POST(request: NextRequest) {
  const body = await request.json();
  // Fail closed: a missing/empty SCRAPE_SECRET must reject, not wave everyone
  // through — this is a destructive endpoint.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!body.id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  try {
    const result = await deleteShow(body.id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    revalidateShows();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
