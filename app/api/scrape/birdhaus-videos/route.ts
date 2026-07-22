import { NextResponse, type NextRequest } from "next/server";
import { importBirdhausVideos } from "@/lib/importBirdhausVideos";
import { revalidateVideos } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On-demand trigger for the Birdhaus band-video import (lib/importBirdhausVideos.ts),
// the same pull the daily scrape cron runs inline (app/api/cron/scrape). Exists
// so the initial backfill — and any ad-hoc refresh — can run immediately in
// prod (where BIRDHAUS_DATABASE_URL is set) instead of waiting for the next
// cron tick. SCRAPE_SECRET-gated, fail-closed, mirroring /api/scrape/all.
export async function GET(request: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importBirdhausVideos({ confirm: true });
    if (result.written > 0) revalidateVideos();
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to import Birdhaus videos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
