import Link from "next/link";
import type { Metadata } from "next";
import { getCachedVenues } from "@/lib/cachedReads";
import VenueGrid from "@/components/VenueGrid";

export const metadata: Metadata = {
  title: "Venues — Twin Scene",
  description: "Venues that host the Twin Cities music scene.",
};

// fetchVenues() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this the page gets cached after its
// first post-deploy render and goes stale on any later venue edit.
export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const venues = await getCachedVenues();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      {/* Visually hidden — every page needs an h1 for accessibility/SEO, but
          the header row (search/filters + CTA) carries the visual identity
          now, same as the home page. */}
      <h1 className="sr-only">Venues — Twin Scene</h1>

      <VenueGrid
        venues={venues}
        intro={
          <Link
            href="/venues/submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            + Add a venue
          </Link>
        }
      />
    </main>
  );
}
