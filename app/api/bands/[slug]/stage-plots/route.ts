import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import { createPlot } from "@/lib/stagePlots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a new stage plot for a band. Same authorization rule as every band
// edit: canEditBand server-side (admin or a band_editors row). Returns the new
// plot id so the client can navigate into the editor.
export async function POST(
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

  let name = "Stage Plot";
  try {
    const body = (await request.json()) as { name?: unknown } | null;
    if (body && typeof body.name === "string" && body.name.trim()) {
      name = body.name;
    }
  } catch {
    // No/'invalid body → default name. Not an error.
  }

  const id = await createPlot(band.id, user.id, name);
  return NextResponse.json({ success: true, id });
}
