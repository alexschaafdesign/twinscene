import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, upsertScrapedShow } from "@/lib/shows";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upserts a scraped/admin-confirmed show by source_key. Called server-to-
// server by the scrape pipeline (lib/scrapers/autoImport.ts) and by the
// Import Review page's "confirm" button — same gate as the scrape endpoints
// since both callers already know SCRAPE_SECRET.
export async function POST(request: NextRequest) {
  const body = await request.json();
  // Fail closed: reject when SCRAPE_SECRET is missing/empty rather than
  // accepting writes from anyone.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const {
    source,
    sourceKey,
    date,
    venue,
    title,
    lineup,
    linkedBands,
    notes,
    link,
    flyerUrl,
    eventType,
    musicTime,
    doorsTime,
    genres,
    ageRestriction,
    actor,
    confidence,
    reviewReasons,
  } = body;
  if (!source || !sourceKey || !date || !venue || !title || !actor) {
    return NextResponse.json(
      { success: false, error: "Missing source, sourceKey, date, venue, title, or actor" },
      { status: 400 },
    );
  }

  try {
    // A human confirming in Import Review sends no confidence/reviewReasons —
    // they've just reviewed it, so it defaults to "ok".
    const { outcome, id } = await upsertScrapedShow(
      {
        source,
        sourceKey,
        date,
        venue,
        title,
        lineup: buildLineupEntries(lineup ?? "", linkedBands ?? []),
        notes: notes ?? "",
        link: link ?? "",
        flyerUrl: flyerUrl ?? "",
        eventType: eventType ?? "",
        musicTime: musicTime ?? null,
        doorsTime: doorsTime ?? null,
        genres: Array.isArray(genres) ? genres : [],
        ageRestriction: ageRestriction ?? null,
        confidence: confidence ?? "ok",
        reviewReasons: Array.isArray(reviewReasons) ? reviewReasons : [],
      },
      actor,
    );
    // `skipped` retained for back-compat with callers that only checked it;
    // `outcome` is the richer created/updated/skipped disposition. Only a real
    // write changes the cached show reads — skip invalidation for no-op upserts
    // so a scrape run that mostly re-sees known shows doesn't churn the tag.
    if (outcome !== "skipped") revalidateShows();
    return NextResponse.json({ success: true, outcome, id, skipped: outcome === "skipped" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
