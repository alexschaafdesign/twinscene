import { NextResponse, type NextRequest } from "next/server";
import { getUserAuthByEmail, createSession } from "@/lib/auth";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/password";
import { isLockedOut, recordLoginAttempt } from "@/lib/loginAttempts";
import { clientIp } from "@/lib/authRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generic, non-enumerating rejection: the same message whether the email is
// unknown, has no password set, or the password is simply wrong. Never reveals
// which of those it was.
const GENERIC_ERROR = "Invalid email or password";

// Password login: verify against password_hash, then issue a session exactly
// like the magic-link callback does — the session layer doesn't care which
// method got you here.
//
// Lockout: after too many failed attempts for this (email, ip) pair the request
// is turned away before we even hash (lib/loginAttempts). A success clears the
// failure streak. Timing is equalized — an unknown email or a password-less
// account still runs one argon2 verify (against a dummy hash) so response time
// can't distinguish those from a wrong password.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = clientIp(request);

  if (!email || !password) {
    return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
  }

  if (await isLockedOut(email, ip)) {
    return NextResponse.json(
      { success: false, error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const account = await getUserAuthByEmail(email);
  // Always run a verify so the no-account / no-password branches cost the same
  // wall-clock time as a real (wrong) password check.
  const passwordOk = await verifyPassword(account?.password_hash ?? DUMMY_PASSWORD_HASH, password);

  if (!account || !account.password_hash || !passwordOk) {
    await recordLoginAttempt(email, ip, false);
    return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
  }

  // Correct password but unverified: reveal the reason ONLY here, past a
  // successful password check — so it can't be used to enumerate accounts (you
  // already had to know the password). Not counted as a failed attempt: it's
  // the legitimate owner, they just haven't clicked the verify link yet.
  if (!account.email_verified_at) {
    return NextResponse.json(
      { success: false, error: "Verify your email before signing in. Check your inbox for the confirmation link." },
      { status: 403 },
    );
  }

  await recordLoginAttempt(email, ip, true);
  await createSession(account.id);
  return NextResponse.json({ success: true });
}
