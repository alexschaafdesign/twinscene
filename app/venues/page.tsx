import Link from "next/link";
import type { Metadata } from "next";
import { fetchVenues } from "@/lib/fetchVenues";
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
  const venues = await fetchVenues();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Venues
          </h1>
          <Link
            href="/venues/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add a venue →
          </Link>
        </div>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Where Twin Cities bands play — DIY spaces, bars, breweries, and
          everything in between.
        </p>
      </header>

      <VenueGrid
        venues={venues}
        intro={
          <>
            <p className="text-[13px] leading-relaxed text-[#E8E0D0]/75">
              <span className="font-semibold text-[#E8E0D0]">Venues</span> —
              search and filter to find one; it might already be listed.
              Otherwise, add it!
            </p>
            <Link
              href="/venues/submit"
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
            >
              + Add a venue
            </Link>
          </>
        }
      />
    </main>
  );
}
