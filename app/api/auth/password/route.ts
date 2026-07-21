import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getUserAuthByEmail, setPasswordForUser } from "@/lib/auth";
import { hashPassword, verifyPassword, InvalidPasswordError } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set or change your own password while signed in (from /profile/edit). The
// session already proves ownership, so no email round-trip is needed — this is
// how a magic-link user adds a password without leaving the app.
//
// Changing an existing password requires the current one (a shoulder-surf /
// borrowed-session guard). Setting a first password (has_password false) needs
// no current password — there isn't one.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to set a password" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (err) {
    if (err instanceof InvalidPasswordError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (user.has_password) {
    const account = await getUserAuthByEmail(user.email);
    const currentOk =
      !!account?.password_hash && (await verifyPassword(account.password_hash, currentPassword));
    if (!currentOk) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect" },
        { status: 400 },
      );
    }
  }

  await setPasswordForUser(user.id, passwordHash);
  return NextResponse.json({ success: true });
}
