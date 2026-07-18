import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { decideMusicianClaim, MusicianAlreadyLinkedError } from "@/lib/musicianClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: approve or reject a pending musician claim. Approval, in one
// transaction, links musicians.user_id and grants band_editors for every
// band the musician is a member of (lib/musicianClaims.ts decideMusicianClaim).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claimId = Number(id);
  if (!Number.isInteger(claimId)) {
    return NextResponse.json({ success: false, error: "Invalid claim id" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const decision = body?.decision === "approve" ? "approved" : body?.decision === "reject" ? "rejected" : null;
  if (!decision) {
    return NextResponse.json(
      { success: false, error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  try {
    const claim = await decideMusicianClaim(claimId, decision, user.id);
    if (!claim) {
      return NextResponse.json(
        { success: false, error: "Claim not found or already decided" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof MusicianAlreadyLinkedError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
