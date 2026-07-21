import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { annotateShow } from "@/lib/shows";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: apply a Crawl Space genre/age suggestion onto a matched show
// right now, instead of waiting for the nightly reconcile run. Same fill-only
// semantics as the cron path (lib/scrapers/reconcile.ts) — annotateShow never
// overwrites a genre/age the show already has.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { id, genres, ageRestriction } = body ?? {};
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const result = await annotateShow(
    id,
    {
      genres: Array.isArray(genres) ? genres : [],
      ageRestriction: typeof ageRestriction === "string" ? ageRestriction : null,
    },
    `admin:${user.email}`,
  );
  if (!result.success) {
    return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
  }
  if (result.changed) revalidateShows();
  return NextResponse.json({ success: true, changed: result.changed });
}
