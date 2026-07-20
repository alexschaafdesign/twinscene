import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import { fetchBands } from "@/lib/fetchBands";
import BandLinkSearch from "@/components/BandLinkSearch";

export const metadata: Metadata = {
  title: "Do you have a band? — Twin Scene",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Entry point for finding or quick-adding a band — mirrors
// app/profile/musician/page.tsx, but there's no one-band-per-user rule (a
// user can end up an editor on several bands), so unlike the musician page
// this never auto-redirects away; it's always safe to revisit.
export default async function BandLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNextPath(typeof sp.next === "string" ? sp.next : null) || undefined;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/profile/band${next ? `?next=${next}` : ""}`)}`);
  }

  const bands = await fetchBands();
  const bandEntries = bands.map((b) => ({ name: b.name, slug: b.slug }));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <h1 className="text-xl font-medium">Do you have a band?</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Find your band in the directory, or add it if it&apos;s not listed
        yet. Either way, claiming edit access needs a quick Instagram DM to
        verify it&apos;s really you — see the instructions once you&apos;ve
        found or added your band.
      </p>
      <BandLinkSearch bands={bandEntries} next={next} />
    </main>
  );
}
