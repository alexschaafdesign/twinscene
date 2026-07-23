import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditWriter } from "@/lib/auth";
import { getWriterBySlug } from "@/lib/writers";
import { createClaim, DuplicateClaimError } from "@/lib/writerClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests editor access to a writer profile. Opens a 'pending'
// writer_claims row for an admin to review — see /api/admin/writer-claims.
// Mirrors app/api/media-pros/[slug]/claim.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const writer = await getWriterBySlug(slug);
  if (!writer) {
    return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim this profile" }, { status: 401 });
  }

  if (await canEditWriter(user, writer.id)) {
    return NextResponse.json(
      { success: false, error: "You already have edit access to this profile" },
      { status: 400 },
    );
  }

  try {
    const claim = await createClaim(user.id, writer.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
