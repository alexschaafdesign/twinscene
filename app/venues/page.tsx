import Link from "next/link";
import type { Metadata } from "next";
import { fetchVenues } from "@/lib/fetchVenues";
import VenueGrid from "@/components/VenueGrid";

export const metadata: Metadata = {
  title: "Venues — Twin Scene",
  description: "Venues that host the Twin Cities music scene.",
};

export default async function VenuesPage() {
  const venues = await fetchVenues();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <nav className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
          >
            <span aria-hidden>←</span> Directory
          </Link>
          <Link
            href="/venues/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add a venue →
          </Link>
        </nav>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Venues
        </h1>
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
