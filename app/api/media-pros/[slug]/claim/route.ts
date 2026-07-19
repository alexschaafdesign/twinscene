import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditMediaPro } from "@/lib/auth";
import { getMediaProBySlug } from "@/lib/mediaPros";
import { createClaim, DuplicateClaimError } from "@/lib/mediaProClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests editor access to a media pro listing. Opens a
// 'pending' media_pro_claims row for an admin to review — see
// /api/admin/media-pro-claims. Mirrors app/api/bands/[slug]/claim.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mediaPro = await getMediaProBySlug(slug);
  if (!mediaPro) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim this listing" }, { status: 401 });
  }

  if (await canEditMediaPro(user, mediaPro.id)) {
    return NextResponse.json(
      { success: false, error: "You already have edit access to this listing" },
      { status: 400 },
    );
  }

  try {
    const claim = await createClaim(user.id, mediaPro.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
