import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listPendingMusicianClaims } from "@/lib/musicianClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: pending musician claims awaiting a decision.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const claims = await listPendingMusicianClaims();
  return NextResponse.json({ success: true, claims });
}
