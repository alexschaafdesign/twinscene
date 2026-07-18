import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { followBand, unfollowBand } from "@/lib/bandFollows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Toggle a band_follows row for the logged-in user. POST follows, DELETE
// unfollows — both idempotent (see lib/bandFollows.ts), so double-clicking
// never errors. Distinct from /api/bands/[slug]/save — following is "keep up
// with this band", not a bookmark.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to follow bands" }, { status: 401 });
  }

  await followBand(user.id, band.id);
  return NextResponse.json({ success: true, following: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to follow bands" }, { status: 401 });
  }

  await unfollowBand(user.id, band.id);
  return NextResponse.json({ success: true, following: false });
}
