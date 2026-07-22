import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getVenueBySlug, setVenueHidden } from "@/lib/venues";
import { revalidateVenues } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: archive/unarchive a venue (PATCH { hidden: boolean }). Reversible
// — the row and its editors/claims stay put; a hidden venue just drops off the
// public directory. Shows reference venues by name string (no FK), so hiding a
// venue never touches its shows. Gated on is_admin server-side (never on hidden
// UI, per docs/auth-and-db.md). Resolves with includeHidden so an already-hidden
// venue can be unhidden.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const venue = await getVenueBySlug(slug, { includeHidden: true });
  if (!venue) {
    return NextResponse.json({ success: false, error: "Venue not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.hidden !== "boolean") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const result = await setVenueHidden(venue.id, body.hidden);
  if (!result.success) {
    return NextResponse.json({ success: false, error: "Venue not found" }, { status: 404 });
  }

  revalidateVenues();
  return NextResponse.json({ success: true, hidden: body.hidden });
}
