import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, upsertScrapedShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upserts a scraped/admin-confirmed show by source_key. Called server-to-
// server by the scrape pipeline (lib/scrapers/autoImport.ts) and by the
// Import Review page's "confirm" button — same gate as the scrape endpoints
// since both callers already know SCRAPE_SECRET.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const secret = process.env.SCRAPE_SECRET;
  if (secret && body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { source, sourceKey, date, venue, title, lineup, linkedBands, notes, link, flyerUrl, actor } =
    body;
  if (!source || !sourceKey || !date || !venue || !title || !actor) {
    return NextResponse.json(
      { success: false, error: "Missing source, sourceKey, date, venue, title, or actor" },
      { status: 400 },
    );
  }

  try {
    const { skipped } = await upsertScrapedShow(
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
      },
      actor,
    );
    return NextResponse.json({ success: true, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
