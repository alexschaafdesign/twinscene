import { NextResponse, type NextRequest } from "next/server";
import { starShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adds/updates one Press outlet's star on a show. Called server-to-server by
// the press-star pipeline (lib/scrapers/starPress.ts) — same SCRAPE_SECRET
// gate as the scrape endpoints.
export async function POST(request: NextRequest) {
  const body = await request.json();
  // Fail closed: a missing/empty SCRAPE_SECRET must reject, not wave everyone
  // through.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, outlet, blurb, url } = body;
  if (!id || !outlet) {
    return NextResponse.json(
      { success: false, error: "Missing id or outlet" },
      { status: 400 },
    );
  }

  try {
    // The only caller is the fully-automated press-star pipeline — no human
    // in the loop, so this is its own actor, not "admin".
    const result = await starShow(id, outlet, blurb ?? "", url ?? "", `press:${outlet}`);
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Star failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
