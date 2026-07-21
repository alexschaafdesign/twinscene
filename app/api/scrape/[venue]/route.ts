import { NextResponse, type NextRequest } from "next/server";
import { getScraper } from "@/lib/scrapers";
import { runScrapers } from "@/lib/scrapers/runAll";

// The scrape must never be cached, and it uses the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venue: string }> },
) {
  // Fail closed: reject when SCRAPE_SECRET is missing/empty rather than
  // running the scraper for anyone.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
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
    // Real per-venue run: scrapes, auto-imports high-confidence shows, queues
    // the rest, and logs the digest — so the admin's "Last run" is accurate.
    const summary = await runScrapers([scraper], { baseUrl: request.nextUrl.origin });
    const entry = summary.scrapers[0];
    if (entry?.error) throw new Error(entry.error);
    return NextResponse.json(summary);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `Failed to scrape ${scraper.name}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
