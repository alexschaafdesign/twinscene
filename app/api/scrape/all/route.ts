import { NextResponse, type NextRequest } from "next/server";
import { runAllScrapers } from "@/lib/scrapers/runAll";
import { getAllScrapers } from "@/lib/scrapers";

// cheerio needs the Node.js runtime, and the scrape must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The streamed run can outlast the old default — every venue scraped + every
// show imported + press stars + Crawl Space reconcile, one after another.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Fail closed: reject when SCRAPE_SECRET is missing/empty rather than
  // running the scrapers for anyone.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;

  // Streamed mode (the admin dashboard): emit one NDJSON line per progress
  // event so the UI can show live per-venue status, then a final `done` line
  // carrying the full digest. The plain JSON mode below is unchanged for any
  // other caller.
  if (request.nextUrl.searchParams.get("stream") === "1") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        try {
          const scrapers = getAllScrapers();
          send({
            type: "start",
            scrapers: scrapers.map((s) => ({ id: s.id, name: s.name })),
          });
          const summary = await runAllScrapers(origin, scrapers, send);
          send({ type: "done", summary });
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : "Failed to run scrapers",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        // Defeat proxy/CDN buffering so chunks arrive as they're produced.
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    const summary = await runAllScrapers(origin);
    return NextResponse.json(summary);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to run scrapers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
