import { NextResponse, type NextRequest } from "next/server";
import { PRESS_SCRAPERS } from "@/lib/scrapers/pressScrapers";
import { runOnePressStar } from "@/lib/scrapers/starPress";
import { COMPLETE_LIST_SOURCES, reconcileCompleteList } from "@/lib/scrapers/reconcile";

// The scrape must never be cached, and it uses the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-outlet "Run now" for a Press-tab source (mirrors /api/scrape/[venue]
// for venue scrapers, but a press outlet's job is starring + — for outlets
// that also have a complete-list parser — reconciling, not importing new
// shows).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const outlet = PRESS_SCRAPERS.find((o) => o.id === id);
  if (!outlet) {
    return NextResponse.json({ error: `No press outlet registered for '${id}'` }, { status: 404 });
  }

  try {
    const baseUrl = request.nextUrl.origin;
    const press = await runOnePressStar(id, baseUrl);
    // Only outlets with a scrapeXComplete() parser also feed the reconcile
    // job (genre/age fill + missing-show signal) — see reconcile.ts's
    // COMPLETE_LIST_SOURCES.
    const completeSource = COMPLETE_LIST_SOURCES.find((s) => s.id === id);
    const reconcile = completeSource
      ? await reconcileCompleteList(completeSource, baseUrl)
      : undefined;
    return NextResponse.json({ press, reconcile });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to run ${outlet.name}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
