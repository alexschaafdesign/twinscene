import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { fetchBands } from "@/lib/fetchBands";
import { createMatcher } from "@/lib/bandMatcher";
import { autoImportShow } from "@/lib/scrapers/autoImport";
import { CRAWLSPACE_PRESS_ID } from "@/lib/scrapers/crawlspace";
import type { ScrapedShow } from "@/lib/scrapers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: import one "missing from our list" Crawl Space entry as a real
// show, via the same band-matching + autoImportShow path a venue scrape uses
// (lib/scrapers/runAll.ts). Reachable only from /admin/reconcile.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { venue, date, headliner, allBands, musicTime, ageRestriction, genres, sourceUrl } =
    body ?? {};
  if (!venue || !date || !Array.isArray(allBands) || allBands.length === 0) {
    return NextResponse.json(
      { success: false, error: "Missing venue, date, or allBands" },
      { status: 400 },
    );
  }

  const show: ScrapedShow = {
    venue,
    date,
    headliner: headliner ?? allBands[0],
    supporting: allBands.slice(1),
    allBands,
    flyerUrl: null,
    ticketUrl: sourceUrl ?? null,
    doorsTime: null,
    musicTime: musicTime ?? null,
    advancePrice: null,
    dosPrice: null,
    sourceUrl: sourceUrl ?? "",
    genres: Array.isArray(genres) ? genres : [],
    ageRestriction: ageRestriction ?? null,
  };

  const bands = await fetchBands();
  const { matchShow } = createMatcher(bands);
  const matched = matchShow(show);

  const result = await autoImportShow(matched, CRAWLSPACE_PRESS_ID, request.nextUrl.origin);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || "Import failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: result.id, outcome: result.outcome });
}
