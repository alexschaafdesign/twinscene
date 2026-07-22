import { NextResponse, type NextRequest } from "next/server";
import { setShowHidden } from "@/lib/shows";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: archive/unarchive a show (POST { id, hidden, secret }). The safe,
// reversible alternative to /api/shows/delete — the row stays put, just pulled
// off (or restored to) the public site. Called from /admin/shows' Hide/Unhide.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  // Fail closed: a missing/empty SCRAPE_SECRET must reject, not wave everyone
  // through. Same machine token the show panels already authenticate with.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body?.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!body?.id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const hidden = body.hidden !== false; // default to hiding unless explicitly unhiding

  try {
    const result = await setShowHidden(body.id, hidden, "admin");
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    revalidateShows();
    return NextResponse.json({ success: true, hidden });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
