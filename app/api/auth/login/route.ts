import { NextResponse, type NextRequest } from "next/server";
import { requestLoginLink } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-link login, step 1: takes an email, creates a single-use login
// token, and emails the sign-in link (or logs it to the console in dev —
// see lib/email.ts). Always responds success regardless of outcome so this
// endpoint can't be used to enumerate which emails have accounts.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Enter a valid email" }, { status: 400 });
  }

  try {
    await requestLoginLink(email, request.nextUrl.origin);
  } catch (err) {
    console.error("auth/login: failed to send login link", err);
    return NextResponse.json(
      { success: false, error: "Couldn't send the login link" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
