import { NextResponse, type NextRequest } from "next/server";
import { annotateShow } from "@/lib/shows";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Applies a genre/age *suggestion* onto an existing show. Called server-to-
// server by the reconcile pass (lib/scrapers/reconcile.ts) when a reference
// source (Crawl Space) names a show we already have. Same SCRAPE_SECRET gate
// as the scrape/star endpoints. Fill-only semantics live in annotateShow.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, source, genres, ageRestriction } = body;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  try {
    const result = await annotateShow(
      id,
      {
        genres: Array.isArray(genres) ? genres : [],
        ageRestriction: typeof ageRestriction === "string" ? ageRestriction : null,
      },
      `reference:${source || "unknown"}`,
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    // Only a real fill changes cached reads.
    if (result.changed) revalidateShows();
    return NextResponse.json({ success: true, changed: result.changed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Annotate failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
