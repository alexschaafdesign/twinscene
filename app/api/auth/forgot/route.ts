import { NextResponse, type NextRequest } from "next/server";
import { getUserAuthByEmail, sendPasswordResetEmail } from "@/lib/auth";
import { allowAuthRequest, clientIp } from "@/lib/authRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Email-send throttle, same shape as the magic-link and signup sends.
const PER_EMAIL_RULE = { limit: 4, windowSeconds: 15 * 60 } as const;
const PER_IP_RULE = { limit: 20, windowSeconds: 60 * 60 } as const;

// "Forgot password", step 1: emails a reset link if the address has an account.
// Doubles as first-password-set for existing magic-link users (the reset flow
// sets password_hash and marks the email verified).
//
// Always returns a generic success — whether or not the account exists — so it
// can't be used to enumerate registered emails. The reset email only goes out
// when there's actually an account to reset.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Enter a valid email" }, { status: 400 });
  }

  const [ipOk, emailOk] = await Promise.all([
    allowAuthRequest(`ip:${clientIp(request)}`, PER_IP_RULE),
    allowAuthRequest(`email:${email.toLowerCase()}`, PER_EMAIL_RULE),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    const account = await getUserAuthByEmail(email);
    if (account) {
      await sendPasswordResetEmail(email, request.nextUrl.origin);
    }
  } catch (err) {
    console.error("auth/forgot: failed", err);
    return NextResponse.json({ success: false, error: "Couldn't send the reset link" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
