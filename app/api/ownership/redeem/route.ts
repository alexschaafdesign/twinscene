import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  redeemOwnershipCode,
  InvalidOwnershipCodeError,
  ExpiredOwnershipCodeError,
  AlreadyRedeemedOwnershipCodeError,
} from "@/lib/bandOwnership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user redeems a code they received via DM to become that band's
// owner. See lib/bandOwnership.ts for the transactional redeem + role upsert.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to redeem a code" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ success: false, error: "Enter a code" }, { status: 400 });
  }

  try {
    const band = await redeemOwnershipCode(code, user);
    return NextResponse.json({ success: true, band: { slug: band.slug, name: band.name } });
  } catch (err) {
    if (err instanceof InvalidOwnershipCodeError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof ExpiredOwnershipCodeError || err instanceof AlreadyRedeemedOwnershipCodeError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 410 });
    }
    throw err;
  }
}
