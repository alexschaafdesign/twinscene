import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, editShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Edit show" submission — updates an existing show by id and locks
// it against future re-scrapes. No secret gate, matching the old public
// /shows edit flow. /admin/review reuses this same route for its inline
// edit, passing `secret` to log as actor "admin" instead.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, venue, date, title, lineup, notes, link, submitterName, submitterEmail, secret } =
    body;
  if (!id || !date || !venue || !title) {
    return NextResponse.json(
      { success: false, error: "Missing id, date, venue, or title" },
      { status: 400 },
    );
  }

  const linkedBands: { name: string; slug: string }[] = Array.isArray(body.linkedBands)
    ? body.linkedBands
    : [];
  const isAdmin = !!process.env.SCRAPE_SECRET && secret === process.env.SCRAPE_SECRET;

  try {
    const result = await editShow(
      id,
      {
        venue,
        title,
        date,
        lineup: buildLineupEntries(lineup || title, linkedBands),
        notes: notes ?? "",
        link: link ?? "",
      },
      isAdmin ? "admin" : "public_submission",
      isAdmin ? undefined : { name: submitterName, email: submitterEmail },
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
