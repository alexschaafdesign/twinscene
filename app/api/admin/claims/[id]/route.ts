import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { decideClaim } from "@/lib/bandClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: approve or reject a pending claim. Approval inserts the
// band_editors row and marks the claim decided in one transaction
// (lib/bandClaims.ts decideClaim) — they can't drift apart.
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

  const claim = await decideClaim(claimId, decision, user.id);
  if (!claim) {
    return NextResponse.json(
      { success: false, error: "Claim not found or already decided" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, claim });
}
