import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchBands } from "@/lib/fetchBands";
import { getBandBySlug } from "@/lib/bands";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import BandLayoutEditor from "@/components/BandLayoutEditor";
import BackLink from "@/components/BackLink";

type Props = {
  params: Promise<{ slug: string }>;
};

// Reads the DB directly (no fetch()), so Next gets no signal to render
// dynamically — same reason as the profile page it edits.
export const dynamic = "force-dynamic";

// Not a public page; keep it out of search results.
export const metadata: Metadata = {
  title: "Customize profile",
  robots: { index: false, follow: false },
};

export default async function CustomizeBandPage({ params }: Props) {
  const { slug } = await params;

  const bandRow = await getBandBySlug(slug);
  if (!bandRow) notFound();

  const user = await getCurrentUser();
  // Send anonymous visitors through login and back here, rather than showing
  // a dead end. Same-origin relative path, so it satisfies the login route's
  // open-redirect guard.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/bands/${slug}/customize`)}`);
  if (!(await canEditBand(user, bandRow.id))) notFound();

  // The normalized layout lives on the Band shape, not the raw row.
  const bands = await fetchBands();
  const band = bands.find((b) => b.slug === slug);
  if (!band) notFound();

  return (
    <div>
      <BackLink href={`/bands/${slug}`} label={band.name} className="mb-6" />
      <h1 className="text-3xl font-medium leading-tight break-words sm:text-4xl">
        Customize {band.name}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#E8E0D0]/70">
        Rearrange the sections of your profile — move them up and down, shift them between the
        main column and the sidebar, or hide the ones you don&apos;t use. Your photo, name and
        genres stay at the top.
      </p>

      <div className="mt-8 max-w-2xl">
        <BandLayoutEditor slug={slug} initialLayout={band.profileLayout} />
      </div>
    </div>
  );
}
