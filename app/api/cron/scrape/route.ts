import { NextResponse, type NextRequest } from "next/server";
import { runAllScrapers } from "@/lib/scrapers/runAll";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel-cron-only entrypoint. Cron paths can't carry a secret query param, so
// instead of the SCRAPE_SECRET check the on-demand endpoints use, we trust the
// 'x-vercel-cron' header Vercel attaches to scheduled invocations. Runs the
// exact same all-scraper logic as /api/scrape/all.
export async function GET(request: NextRequest) {
  if (!request.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runAllScrapers();
    return NextResponse.json(summary);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to run scrapers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
