import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { createClaim, DuplicateClaimError } from "@/lib/bandClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests editor access to a band. Opens a 'pending'
// band_claims row for an admin to review — see /api/admin/claims.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim a band" }, { status: 401 });
  }

  if (await canEditBand(user, band.id)) {
    return NextResponse.json(
      { success: false, error: "You already have edit access to this band" },
      { status: 400 },
    );
  }

  try {
    const claim = await createClaim(user.id, band.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
