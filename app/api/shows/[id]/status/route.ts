import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { showExists } from "@/lib/fetchShows";
import { setShowStatus, clearShowStatus, isValidShowStatus } from "@/lib/showSaves";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set/clear the logged-in user's attendance status for a show. POST
// {status: 'interested'|'going'|'went'} upserts (see lib/showSaves.ts —
// re-setting or changing status never creates a duplicate row); DELETE
// clears it. Both idempotent, so double-clicking never errors.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to track shows" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (!isValidShowStatus(status)) {
    return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
  }

  if (!(await showExists(id))) {
    return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
  }

  await setShowStatus(user.id, id, status);
  return NextResponse.json({ success: true, status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to track shows" }, { status: 401 });
  }

  await clearShowStatus(user.id, id);
  return NextResponse.json({ success: true, status: null });
}
