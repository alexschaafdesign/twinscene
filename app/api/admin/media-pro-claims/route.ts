import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listPendingClaims } from "@/lib/mediaProClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: pending media-pro claims awaiting a decision. Mirrors
// app/api/admin/claims/route.ts.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const claims = await listPendingClaims();
  return NextResponse.json({ success: true, claims });
}
