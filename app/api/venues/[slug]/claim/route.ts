import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditVenue } from "@/lib/auth";
import { getVenueBySlug } from "@/lib/venues";
import { createClaim, DuplicateClaimError } from "@/lib/venueClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests editor access to a venue. Opens a 'pending'
// venue_claims row for an admin to review — see /api/admin/venue-claims.
// Mirrors app/api/media-pros/[slug]/claim/route.ts.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ success: false, error: "Venue not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim this venue" }, { status: 401 });
  }

  if (await canEditVenue(user, venue.id)) {
    return NextResponse.json(
      { success: false, error: "You already have edit access to this venue" },
      { status: 400 },
    );
  }

  try {
    const claim = await createClaim(user.id, venue.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
