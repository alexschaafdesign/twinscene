import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand, isAdmin } from "@/lib/auth";
import { getBandBySlug, updateBandCoreFields, setBandHidden, toPublicBand } from "@/lib/bands";
import { revalidateBands } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal admin-only band edit path (core text fields only) — exists to
// prove the auth gate end to end. Every branch here is server-side: there's
// no client check this route relies on, and a non-admin (or logged-out)
// caller is rejected before any write regardless of what the UI shows.
//
// Also carries the archive/unarchive action (PATCH { hidden: boolean }). That
// one is is_admin-ONLY — a band editor may edit their band's text but may not
// pull it off the public site — so it's gated more tightly than the core-field
// edit below.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // includeHidden so an already-archived band is still reachable to unhide.
  const band = await getBandBySlug(slug, { includeHidden: true });
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

  // Archive/unarchive — admin-only, not delegated to band editors.
  if (typeof (body as Record<string, unknown>).hidden === "boolean") {
    if (!isAdmin(user)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const hidden = (body as { hidden: boolean }).hidden;
    const result = await setBandHidden(band.id, hidden);
    if (!result.success) {
      return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
    }
    revalidateBands();
    return NextResponse.json({ success: true, hidden });
  }

  const fields = body as Record<string, unknown>;
  const { name, bio, genre, hometown } = fields;
  const updated = await updateBandCoreFields(
    band.id,
    {
      name: typeof name === "string" ? name : undefined,
      bio: typeof bio === "string" ? bio : undefined,
      genre: typeof genre === "string" ? genre : undefined,
      hometown: typeof hometown === "string" ? hometown : undefined,
      // Present key (string | null) → set/clear; absent → left untouched.
      // updateBandCoreFields normalizes anything but 'local'/'touring' to null.
      locality: "locality" in fields ? (fields.locality as string | null) : undefined,
    },
    user?.id,
  );

  revalidateBands();
  return NextResponse.json({ success: true, band: toPublicBand(updated) });
}
