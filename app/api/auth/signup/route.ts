import { NextResponse, type NextRequest } from "next/server";
import {
  createPasswordUser,
  getUserAuthByEmail,
  sendVerificationEmail,
  sendAccountExistsEmail,
} from "@/lib/auth";
import { hashPassword, InvalidPasswordError } from "@/lib/password";
import { allowAuthRequest, clientIp } from "@/lib/authRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint sends a verification email, so it's throttled the same way the
// magic-link send is (lib/authRateLimit): per-email stops re-mailing one inbox,
// per-IP stops one source spraying many addresses.
const PER_EMAIL_RULE = { limit: 4, windowSeconds: 15 * 60 } as const;
const PER_IP_RULE = { limit: 20, windowSeconds: 60 * 60 } as const;

// Password signup, step 1. Creates a NEW account (unverified) with an argon2id
// password hash and emails a verification link; the account can't password-log-
// in until that link is clicked (app/api/auth/verify).
//
// Anti-enumeration: the response is ALWAYS a generic success, whatever the
// email's state. Only the email that actually lands differs, and only the inbox
// owner sees it:
//   * brand-new address        → create unverified user, send verify link
//   * exists but unverified    → resend the verify link (don't touch the row)
//   * exists and verified      → send an "account already exists" nudge
// Critically, an existing account's password is NEVER overwritten here (that
// would be account takeover) — adopting/replacing a password on an existing
// account goes through the reset flow, which proves inbox control.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const next = typeof body?.next === "string" ? body.next : undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Enter a valid email" }, { status: 400 });
  }

  // Password strength is validated (and surfaced) before the rate limiter and
  // any DB work — a too-short password is the user's own input to fix, not an
  // attempt we need to throttle or obscure.
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (err) {
    if (err instanceof InvalidPasswordError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
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
    const existing = await getUserAuthByEmail(email);
    if (!existing) {
      const { isNew } = await createPasswordUser(email, passwordHash);
      // isNew false here means a concurrent signup just created the (still
      // unverified) row — resending the verify link is the right move either way.
      void isNew;
      await sendVerificationEmail(email, request.nextUrl.origin, next);
    } else if (!existing.email_verified_at) {
      // Pending signup that never verified — resend the link. Deliberately does
      // NOT update password_hash to the new attempt's value (an unauthenticated
      // request must not mutate an existing account).
      await sendVerificationEmail(email, request.nextUrl.origin, next);
    } else {
      await sendAccountExistsEmail(email, request.nextUrl.origin);
    }
  } catch (err) {
    console.error("auth/signup: failed", err);
    return NextResponse.json({ success: false, error: "Couldn't complete signup" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
