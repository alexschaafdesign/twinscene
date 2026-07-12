import { NextResponse, type NextRequest } from "next/server";
import { linkBandToShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attaches a directory band to a scheduled show's matching lineup entry.
// Called from the Import Review page's relink sweep — same SCRAPE_SECRET
// gate as the rest of that admin-only page.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const secret = process.env.SCRAPE_SECRET;
  if (secret && body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, scrapedName, bandSlug } = body;
  if (!id || !scrapedName || !bandSlug) {
    return NextResponse.json(
      { success: false, error: "Missing id, scrapedName, or bandSlug" },
      { status: 400 },
    );
  }

  try {
    // The only caller is the admin-only Import Review page's relink sweep.
    const result = await linkBandToShow(id, scrapedName, bandSlug, "admin");
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Link failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
