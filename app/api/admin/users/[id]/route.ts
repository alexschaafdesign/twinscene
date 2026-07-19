import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin, setUserAdmin, LastAdminError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: grant or revoke another account's is_admin flag. The gate is
// re-checked here, not inherited from the page that renders the toggle
// (docs/auth-and-db.md: a missing button is not a permission check).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!isAdmin(actor)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ success: false, error: "Bad user id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.is_admin !== "boolean") {
    return NextResponse.json({ success: false, error: "Missing is_admin" }, { status: 400 });
  }

  // Self-demotion is the one revocation the UI can't undo for you: drop your
  // own flag and the page that would grant it back is gone. Blocked outright
  // — stepping down means another admin does it for you.
  //
  // Number() is load-bearing: users.id is a Postgres bigint, which postgres.js
  // hands back as a *string* at runtime even though User types it as number,
  // so a bare `===` against the parsed param silently never matches.
  if (userId === Number(actor.id) && !body.is_admin) {
    return NextResponse.json(
      { success: false, error: "You can't remove your own admin access — ask another admin." },
      { status: 400 },
    );
  }

  try {
    const user = await setUserAdmin(userId, body.is_admin);
    return NextResponse.json({ success: true, is_admin: user.is_admin });
  } catch (err) {
    if (err instanceof LastAdminError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
