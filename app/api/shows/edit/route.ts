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
  const { id, venue, date, title, lineup, notes, link, musicTime, doorsTime, genres, ageRestriction, secret } = body;
  if (!id || !date || !venue || !title) {
    return NextResponse.json(
      { success: false, error: "Missing id, date, venue, or title" },
      { status: 400 },
    );
  }

  const linkedBands: { name: string; slug: string }[] = Array.isArray(body.linkedBands)
    ? body.linkedBands
    : [];

  // buildLineupEntries derives entries from the free-text lineup and only
  // attaches a slug where a name matches. A band picked in the form's band
  // selector whose name isn't in that text (e.g. one just quick-added to the
  // directory) would otherwise be silently dropped — append any such linked
  // band as its own entry so the link actually persists.
  const lineupEntries = buildLineupEntries(lineup || title, linkedBands);
  const present = new Set(lineupEntries.map((e) => e.name.trim().toLowerCase()));
  for (const b of linkedBands) {
    const key = b.name.trim().toLowerCase();
    if (key && !present.has(key)) {
      lineupEntries.push({ name: b.name.trim(), bandSlug: b.slug });
      present.add(key);
    }
  }

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
        lineup: lineupEntries,
        notes: notes ?? "",
        link: link ?? "",
        // Only the show-edit form sends these; admin-review's inline edit omits
        // them, so leave them undefined there to preserve the existing times.
        musicTime: typeof musicTime === "string" ? musicTime : undefined,
        doorsTime: typeof doorsTime === "string" ? doorsTime : undefined,
        // Genres arrive as one comma-separated string; normalizeGenres (in
        // editShow) splits it. undefined => admin-review path, leave as-is.
        genres: typeof genres === "string" ? [genres] : undefined,
        ageRestriction: typeof ageRestriction === "string" ? ageRestriction : undefined,
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
