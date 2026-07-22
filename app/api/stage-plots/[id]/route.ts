import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import {
  getPlotBandId,
  normalizeContent,
  saveContent,
  deletePlot,
} from "@/lib/stagePlots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plots are keyed by a globally-unique id, so these routes look up the plot's
// owning band and gate on canEditBand — the same rule as the band-scoped
// routes, just reached via the plot instead of a slug. A missing plot and an
// unauthorized one both 404/403 without leaking which.
async function authorizePlot(idParam: string) {
  const plotId = Number(idParam);
  if (!Number.isInteger(plotId) || plotId <= 0) {
    return { error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
  }
  const bandId = await getPlotBandId(plotId);
  if (bandId === null) {
    return { error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "Log in to edit this band" }, { status: 401 }) };
  }
  if (!(await canEditBand(user, bandId))) {
    return { error: NextResponse.json({ success: false, error: "You don't have edit access to this band" }, { status: 403 }) };
  }
  return { plotId };
}

// Autosave: replace the plot's name + both child lists from the editor state.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizePlot(id);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = normalizeContent(body);
  await saveContent(auth.plotId, content);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizePlot(id);
  if (auth.error) return auth.error;

  await deletePlot(auth.plotId);
  return NextResponse.json({ success: true });
}
