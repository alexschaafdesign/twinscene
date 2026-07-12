import { NextResponse, type NextRequest } from "next/server";
import { runAllScrapers } from "@/lib/scrapers/runAll";
import { SHOWS_ENABLED } from "@/lib/features";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel-cron-only entrypoint. Cron paths can't carry a secret query param, so
// instead of the SCRAPE_SECRET check the on-demand endpoints use, we trust the
// 'x-vercel-cron' header Vercel attaches to scheduled invocations. Runs the
// exact same all-scraper logic as /api/scrape/all.
// Scheduled in vercel.json at "0 13 * * *" = 13:00 UTC daily (~8am CT).
export async function GET(request: NextRequest) {
  if (!request.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Gated by the feature flag: with Shows off (production default) the daily
  // scrape stays inert — no auto-import, no digest email — until it's enabled.
  if (!SHOWS_ENABLED) {
    return NextResponse.json({ skipped: "shows disabled" });
  }

  try {
    const summary = await runAllScrapers(request.nextUrl.origin);
    return NextResponse.json(summary);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to run scrapers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
