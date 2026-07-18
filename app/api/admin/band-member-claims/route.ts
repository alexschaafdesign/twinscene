import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listAllPendingClaims } from "@/lib/bandMemberClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: every pending band-member claim, across all bands. Owners
// handle their own bands' claims directly (see /api/bands/[slug]/member-claims);
// this is the fallback (ownerless bands) + oversight queue.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const claims = await listAllPendingClaims();
  return NextResponse.json({ success: true, claims });
}
