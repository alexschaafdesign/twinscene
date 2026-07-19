import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordOnboardingInterest, isOnboardingInterestRole } from "@/lib/onboardingInterest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Onboarding's photographer/venue steps: "notify me when this launches".
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in first" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!isOnboardingInterestRole(role)) {
    return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
  }

  await recordOnboardingInterest(user.id, role);
  return NextResponse.json({ success: true });
}
