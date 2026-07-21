import { NextResponse, type NextRequest } from "next/server";
import { requestLoginLink } from "@/lib/auth";
import { allowAuthRequest } from "@/lib/authRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two fixed-window limits guard this endpoint (see lib/authRateLimit.ts):
// a tight per-email limit stops bombing one inbox with sign-in links, and a
// looser per-IP limit stops one source spraying links at many addresses.
// Both are generous enough that a real person signing in never trips them.
const PER_EMAIL_RULE = { limit: 4, windowSeconds: 15 * 60 } as const;
const PER_IP_RULE = { limit: 20, windowSeconds: 60 * 60 } as const;

// Best-effort client IP. Vercel sets x-forwarded-for; take the first hop (the
// original client) and fall back to a shared bucket if it's ever absent — a
// missing IP shouldn't disable the limiter, so unknowns share one window.
function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

// Magic-link login, step 1: takes an email, creates a single-use login
// token, and emails the sign-in link (or logs it to the console in dev —
// see lib/email.ts). Always responds success regardless of outcome so this
// endpoint can't be used to enumerate which emails have accounts.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const next = typeof body?.next === "string" ? body.next : undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Enter a valid email" }, { status: 400 });
  }

  // Rate limit before sending. A 429 leaks nothing about account existence —
  // it reflects the caller's request volume, not whether the email is known —
  // so it doesn't undercut the anti-enumeration success-always behavior below.
  const [ipOk, emailOk] = await Promise.all([
    allowAuthRequest(`ip:${clientIp(request)}`, PER_IP_RULE),
    allowAuthRequest(`email:${email.toLowerCase()}`, PER_EMAIL_RULE),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json(
      { success: false, error: "Too many sign-in attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    await requestLoginLink(email, request.nextUrl.origin, next);
  } catch (err) {
    console.error("auth/login: failed to send login link", err);
    return NextResponse.json(
      { success: false, error: "Couldn't send the login link" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
