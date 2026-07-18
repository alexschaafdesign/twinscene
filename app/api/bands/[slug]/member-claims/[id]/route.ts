import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import {
  decideMemberClaim,
  ForbiddenClaimDecisionError,
  MusicianAlreadyLinkedError,
} from "@/lib/bandMemberClaims";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Band owner (or admin, for ownerless bands) approves/rejects a pending
// member claim on their band. Permission is enforced inside
// decideMemberClaim (canApproveMemberClaim) — never a bare is_admin check.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const claimId = Number(id);
  if (!Number.isInteger(claimId)) {
    return NextResponse.json({ success: false, error: "Invalid claim id" }, { status: 400 });
  }

  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in first" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const decision = body?.decision === "approve" ? "approved" : body?.decision === "reject" ? "rejected" : null;
  if (!decision) {
    return NextResponse.json(
      { success: false, error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  // Belt-and-suspenders: the claim id must actually belong to the band named
  // in the URL, not just some band this owner happens to also own.
  const [claimBand] = await sql<{ band_id: number }[]>`
    select band_id from band_member_claims where id = ${claimId} limit 1
  `;
  if (!claimBand || claimBand.band_id !== band.id) {
    return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
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
