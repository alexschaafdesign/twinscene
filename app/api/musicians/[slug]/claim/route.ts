import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMusicianPageData } from "@/lib/musicians";
import { getBandBySlug } from "@/lib/bands";
import {
  createMemberClaim,
  DuplicateClaimError,
  MusicianAlreadyLinkedError,
  UserAlreadyLinkedError,
} from "@/lib/bandMemberClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user claims a musician found via the /profile/musician directory
// search. Claims are band-scoped now (Slice B), so "claiming" a musician
// listed in multiple bands opens one band_member_claims row per band —
// each reviewed independently by that band's owner (or an admin, for
// ownerless bands). MusicianAlreadyLinkedError/UserAlreadyLinkedError don't
// depend on which band, so the first one short-circuits the loop.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const musician = await getMusicianPageData(slug);
  if (!musician) {
    return NextResponse.json({ success: false, error: "Musician not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim a musician" }, { status: 401 });
  }

  if (musician.bands.length === 0) {
    return NextResponse.json(
      { success: false, error: "This musician isn't listed in any band yet" },
      { status: 400 },
    );
  }

  const results: { band: string; status: "pending" | "duplicate" }[] = [];
  for (const band of musician.bands) {
    const bandRow = await getBandBySlug(band.slug);
    if (!bandRow) continue;

    try {
      await createMemberClaim(user, bandRow.id, { musicianId: musician.id });
      results.push({ band: band.slug, status: "pending" });
    } catch (err) {
      if (err instanceof DuplicateClaimError) {
        results.push({ band: band.slug, status: "duplicate" });
        continue;
      }
      if (err instanceof MusicianAlreadyLinkedError || err instanceof UserAlreadyLinkedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  return NextResponse.json({ success: true, claims: results });
}
