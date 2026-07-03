import { NextResponse, type NextRequest } from "next/server";
import { getScraper } from "@/lib/scrapers";
import { fetchBands } from "@/lib/fetchBands";
import { createMatcher, type MatchedShow } from "@/lib/bandMatcher";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venue: string }> },
) {
  const secret = process.env.SCRAPE_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { venue } = await params;
  const scraper = getScraper(venue);
  if (!scraper) {
    return NextResponse.json(
      { error: `No scraper registered for '${venue}'` },
      { status: 404 },
    );
  }

  try {
    const bands = await fetchBands();
    const { matchShow } = createMatcher(bands);
    const scraped = await scraper.scrape();
    const shows: MatchedShow[] = scraped.map(matchShow);

    return NextResponse.json({
      scraper: scraper.name,
      scraped: shows.length,
      shows,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `Failed to scrape ${scraper.name}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
