import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandById } from "@/lib/bands";
import { getPlotDetail } from "@/lib/stagePlots";
import { renderStagePlotPdf } from "@/lib/stagePlotPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generate a stage plot PDF on request — never stored, no share token. Requires
// the same authenticated, authorized session as the editor: look up the plot's
// band and gate on canEditBand. A missing plot and an unauthorized one 404/403.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const plotId = Number(id);
  if (!Number.isInteger(plotId) || plotId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const detail = await getPlotDetail(plotId);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in to export this plot" }, { status: 401 });
  }
  if (!(await canEditBand(user, detail.plot.band_id))) {
    return NextResponse.json({ error: "You don't have access to this plot" }, { status: 403 });
  }

  const band = await getBandById(detail.plot.band_id);
  const bandName = band?.name ?? "Stage Plot";

  const pdf = await renderStagePlotPdf(bandName, detail);

  // A slug-ish filename from band + plot name so downloads are tellable apart.
  const fileName =
    `${bandName}-${detail.plot.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "stage-plot";

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
