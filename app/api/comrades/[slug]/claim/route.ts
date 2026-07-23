import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditComrade } from "@/lib/auth";
import { getComradeBySlug } from "@/lib/comrades";
import { createClaim, DuplicateClaimError } from "@/lib/comradeClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests editor access to a comrade listing. Opens a
// 'pending' comrade_claims row for an admin to review — see
// /api/admin/comrade-claims. Mirrors app/api/media-pros/[slug]/claim.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim this listing" }, { status: 401 });
  }

  if (await canEditComrade(user, comrade.id)) {
    return NextResponse.json(
      { success: false, error: "You already have edit access to this listing" },
      { status: 400 },
    );
  }

  try {
    const claim = await createClaim(user.id, comrade.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
