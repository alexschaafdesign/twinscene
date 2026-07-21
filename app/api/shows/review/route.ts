import { NextResponse, type NextRequest } from "next/server";
import { markShowReviewed } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: clears a show's needs_review flag once a human has confirmed
// it looks fine. Called from /admin/review's "✓ Looks good" button.
export async function POST(request: NextRequest) {
  const body = await request.json();
  // Fail closed: reject when SCRAPE_SECRET is missing/empty.
  const secret = process.env.SCRAPE_SECRET;
  if (!secret || body.secret !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!body.id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  try {
    const result = await markShowReviewed(body.id, "admin");
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
