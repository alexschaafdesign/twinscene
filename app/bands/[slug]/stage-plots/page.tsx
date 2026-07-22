import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBandBySlug } from "@/lib/bands";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { listPlots } from "@/lib/stagePlots";
import StagePlotsIndex from "@/components/StagePlotsIndex";
import BackLink from "@/components/BackLink";

type Props = { params: Promise<{ slug: string }> };

// Reads the DB directly, same as the customize page it sits beside.
export const dynamic = "force-dynamic";

// Not a public page; keep it out of search results.
export const metadata: Metadata = {
  title: "Stage plots",
  robots: { index: false, follow: false },
};

export default async function StagePlotsPage({ params }: Props) {
  const { slug } = await params;

  const band = await getBandBySlug(slug);
  if (!band) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/bands/${slug}/stage-plots`)}`);
  if (!(await canEditBand(user, band.id))) notFound();

  const plots = await listPlots(band.id);

  return (
    <div>
      <BackLink href={`/bands/${slug}`} label={band.name} className="mb-6" />
      <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
        Stage plots
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#E8E0D0]/70">
        Build a stage diagram and numbered input list for {band.name}, then export it as a PDF to
        send to venues. Make as many as you need — one for the full band, one for an acoustic set,
        one per tour.
      </p>

      <div className="mt-8 max-w-3xl">
        <StagePlotsIndex slug={slug} initialPlots={plots} />
      </div>
    </div>
  );
}
