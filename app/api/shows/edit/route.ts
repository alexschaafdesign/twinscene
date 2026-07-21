import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, editShow } from "@/lib/shows";
import { getCurrentUser } from "@/lib/auth";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Edit show" submission — updates an existing show by id and locks it
// against future re-scrapes. /admin/review reuses this same route for its
// inline edit, passing `secret` to log as actor "admin" instead — that path
// stays open (no login check), everything else now requires login.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, venue, date, title, lineup, notes, link, secret } = body;
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

  const user = isAdmin ? null : await getCurrentUser();
  if (!isAdmin && !user) {
    return NextResponse.json({ success: false, error: "Log in to edit this show." }, { status: 401 });
  }

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
      isAdmin ? undefined : { name: user!.name ?? user!.email, email: user!.email },
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    revalidateShows();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
