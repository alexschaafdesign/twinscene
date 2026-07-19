import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setStatus, InvalidStatusError } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user setting their own "[name] is ..." status. Its own route
// rather than a field on PATCH /api/profile because it's set inline from
// /profile (one box, one button) instead of from the edit form — a status is
// meant to be changed often and cheaply.
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to set a status" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : null;

  try {
    const updated = await setStatus(user.id, status);
    return NextResponse.json({
      success: true,
      status: updated.status,
      statusAt: updated.status_at,
    });
  } catch (err) {
    if (err instanceof InvalidStatusError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
