import { NextResponse, type NextRequest } from "next/server";
import { fetchBands } from "@/lib/fetchBands";
import { scrapePilllar } from "@/lib/scrapers/pilllar";
import { createMatcher, type MatchedShow } from "@/lib/bandMatcher";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bands = await fetchBands();
    const scraped = await scrapePilllar();
    const { matchShow } = createMatcher(bands);
    const shows: MatchedShow[] = scraped.map(matchShow);

    return NextResponse.json({ scraped: shows.length, shows });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to scrape Pilllar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
