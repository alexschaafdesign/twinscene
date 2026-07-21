import { NextResponse, type NextRequest } from "next/server";
import { consumeToken, setPasswordByEmail, createSession } from "@/lib/auth";
import { hashPassword, InvalidPasswordError } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Forgot password", step 2: the /reset page posts the token from the emailed
// link plus the new password here. Consumes the single-use 'reset' token, sets
// the new argon2id hash (and marks the email verified — a reset link proves
// inbox control), then starts a session so the user is signed in on success.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token) {
    return NextResponse.json(
      { success: false, error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (err) {
    if (err instanceof InvalidPasswordError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Consume the token only after the new password validates, so a valid link
  // isn't burned by a too-short password (the user can retry on the same page).
  const email = await consumeToken(token, "reset");
  if (!email) {
    return NextResponse.json(
      { success: false, error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const user = await setPasswordByEmail(email, passwordHash);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  await createSession(user.id);
  return NextResponse.json({ success: true });
}
