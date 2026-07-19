import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount, listNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The header bell's data source: the current user's recent notifications plus
// the unread count for the badge. Logged-out callers get an empty, zero payload
// rather than a 401 — the bell simply isn't rendered for them, and this keeps a
// stray poll from erroring.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ unreadCount: 0, items: [] });
  }

  const [unreadCount, items] = await Promise.all([
    getUnreadCount(user.id),
    listNotifications(user.id),
  ]);
  return NextResponse.json({ unreadCount, items });
}
