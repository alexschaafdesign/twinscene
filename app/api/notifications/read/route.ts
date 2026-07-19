import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marks all of the current user's notifications read — fired when they open the
// bell dropdown (or the full inbox). Idempotent: no unread rows just flips zero.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  }
  const marked = await markAllRead(user.id);
  return NextResponse.json({ success: true, marked });
}
