import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandBySlug, updateBandCoreFields, toPublicBand } from "@/lib/bands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal admin-only band edit path (core text fields only) — exists to
// prove the auth gate end to end. Every branch here is server-side: there's
// no client check this route relies on, and a non-admin (or logged-out)
// caller is rejected before any write regardless of what the UI shows.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!(await canEditBand(user, band.id))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const { name, bio, genre, hometown } = body as Record<string, unknown>;
  const updated = await updateBandCoreFields(
    band.id,
    {
      name: typeof name === "string" ? name : undefined,
      bio: typeof bio === "string" ? bio : undefined,
      genre: typeof genre === "string" ? genre : undefined,
      hometown: typeof hometown === "string" ? hometown : undefined,
    },
    user?.id,
  );

  return NextResponse.json({ success: true, band: toPublicBand(updated) });
}
