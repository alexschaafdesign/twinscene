import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { saveBand, unsaveBand } from "@/lib/savedBands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Toggle a saved-band row for the logged-in user. POST saves, DELETE unsaves —
// both idempotent (see lib/savedBands.ts), so double-clicking never errors.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to save bands" }, { status: 401 });
  }

  await saveBand(user.id, band.id);
  return NextResponse.json({ success: true, saved: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to save bands" }, { status: 401 });
  }

  await unsaveBand(user.id, band.id);
  return NextResponse.json({ success: true, saved: false });
}
