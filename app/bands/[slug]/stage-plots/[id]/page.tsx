import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBandBySlug } from "@/lib/bands";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getPlotDetail } from "@/lib/stagePlots";
import StagePlotEditor from "@/components/StagePlotEditor";
import BackLink from "@/components/BackLink";

type Props = { params: Promise<{ slug: string; id: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit stage plot",
  robots: { index: false, follow: false },
};

export default async function StagePlotEditorPage({ params }: Props) {
  const { slug, id } = await params;

  const band = await getBandBySlug(slug);
  if (!band) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bands/${slug}/stage-plots/${id}`)}`);
  }
  if (!(await canEditBand(user, band.id))) notFound();

  const plotId = Number(id);
  if (!Number.isInteger(plotId) || plotId <= 0) notFound();

  const detail = await getPlotDetail(plotId);
  // The plot must exist AND belong to the band in the URL — guards against
  // /bands/other-band/stage-plots/<a plot you can edit elsewhere>.
  if (!detail || detail.plot.band_id !== band.id) notFound();

  return (
    <div>
      <BackLink href={`/bands/${slug}/stage-plots`} label="Stage plots" className="mb-6" />
      <StagePlotEditor
        plotId={plotId}
        initialName={detail.plot.name}
        initialItems={detail.items}
        initialInputs={detail.inputs}
      />
    </div>
  );
}
