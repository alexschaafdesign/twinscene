import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandBySlug, updateBandProfileLayout } from "@/lib/bands";
import { normalizeLayout } from "@/lib/bandProfileLayout";
import { revalidateBands } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save the band's profile section arrangement (order, region, visibility).
//
// Same authorization rule as every other band edit: canEditBand server-side —
// admin, or a band_editors row. The customize page hides itself from everyone
// else, but a missing button is not a permission check, so the gate lives here.
//
// The body is untrusted, so it goes through normalizeLayout() before it's
// persisted: unknown section ids are dropped, duplicates collapsed, pinned
// sections (the moderation UI) forced back to their default slots, and
// anything unmentioned restored. That means a malformed or hostile payload
// can't produce a profile that fails to render.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to edit this band" }, { status: 401 });
  }
  if (!(await canEditBand(user, band.id))) {
    return NextResponse.json(
      { success: false, error: "You don't have edit access to this band" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const layout = normalizeLayout((body as { layout?: unknown } | null)?.layout);
  await updateBandProfileLayout(band.id, layout);

  revalidateBands();
  return NextResponse.json({ success: true, layout });
}
