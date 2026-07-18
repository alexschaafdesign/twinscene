import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { generateOwnershipCode, listOwnershipCodes } from "@/lib/bandOwnership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only. GET lists this band's codes (status only — see
// lib/bandOwnership.ts, the raw code is never stored so it can't leak here).
// POST mints a new one and returns the plaintext ONCE for the admin to
// copy/DM after verifying the band's Instagram out-of-band.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const codes = await listOwnershipCodes(band.id);
  return NextResponse.json({ success: true, codes });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const code = await generateOwnershipCode(band.id, user);
  return NextResponse.json({ success: true, code });
}
