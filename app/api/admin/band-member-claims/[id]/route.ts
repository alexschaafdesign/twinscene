import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  decideMemberClaim,
  ForbiddenClaimDecisionError,
  MusicianAlreadyLinkedError,
} from "@/lib/bandMemberClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only route for the oversight queue (app/admin/band-member-claims) —
// gates on isAdmin since this page is only ever shown to admins, but the
// actual authorization is still canApproveMemberClaim inside
// decideMemberClaim (which admins always satisfy), same rule an owner's
// per-band route uses.
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
    const claim = await decideMemberClaim(claimId, decision, user);
    if (!claim) {
      return NextResponse.json(
        { success: false, error: "Claim not found or already decided" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof ForbiddenClaimDecisionError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }
    if (err instanceof MusicianAlreadyLinkedError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
