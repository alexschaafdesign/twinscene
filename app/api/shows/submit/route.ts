import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, insertManualShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lowercase/hyphenate. Mirrors slugify() in lib/fetchBands.ts. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Public "Add a show" submission. No secret gate — matches the old public
// /shows/submit form, open to any site visitor.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { venue, date, notes, link, newBandName, submitterName, submitterEmail } = body;
  if (!date || !venue) {
    return NextResponse.json(
      { success: false, error: "Missing date or venue" },
      { status: 400 },
    );
  }

  const linkedBands: { name: string; slug: string }[] = Array.isArray(body.linkedBands)
    ? [...body.linkedBands]
    : [];
  if (newBandName) linkedBands.push({ name: newBandName, slug: slugify(newBandName) });

  const names = linkedBands.map((b) => b.name);
  const title = names[0] || venue;
  const lineup = names.join(", ");

  try {
    const { id } = await insertManualShow(
      {
        venue,
        title,
        date,
        lineup: buildLineupEntries(lineup, linkedBands),
        notes: notes ?? "",
        link: link ?? "",
      },
      "public_submission",
      { name: submitterName, email: submitterEmail },
    );
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
