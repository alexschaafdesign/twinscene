import { NextResponse, type NextRequest } from "next/server";
import { runAllScrapers } from "@/lib/scrapers/runAll";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
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
