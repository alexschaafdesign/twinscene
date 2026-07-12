import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import BandGrid from "@/components/BandGrid";
import { SHOWS_ENABLED } from "@/lib/features";

// The home page: the band directory. It's the site's only section for now, so
// it lives at the root. Individual profiles are at /bands/[slug]; a dedicated
// /bands index can be added later alongside sibling sections (/venues, …).
export default async function Home() {
  // Shows are gated behind SHOWS_ENABLED (see AGENTS.md); off, the "upcoming
  // shows" band filter simply doesn't render. fetchShows() already excludes
  // past dates, so a band's slug showing up here means it has something
  // upcoming.
  const [bands, shows] = await Promise.all([
    fetchBands(),
    SHOWS_ENABLED ? fetchShows() : Promise.resolve([]),
  ]);
  const bandsWithUpcomingShows = [
    ...new Set(shows.flatMap((s) => s.bandSlugs)),
  ];

  // Admin link. Off production we bake the secret in for one-click access
  // (local/preview only); in production we never embed it — the link is a plain
  // /admin that prompts for the secret — so the public site's HTML can't leak it.
  const secret = process.env.SCRAPE_SECRET;
  const isProduction = process.env.VERCEL_ENV === "production";
  const adminHref =
    secret && !isProduction
      ? `/admin?secret=${encodeURIComponent(secret)}`
      : "/admin";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <h1 className="m-0 order-1 sm:order-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Crawlspace"
            className="mx-auto block w-full max-w-[180px] sm:mx-0"
          />
        </h1>

        <div className="text-center sm:text-right">
          <p className="mt-0 text-lg font-medium leading-snug text-[#E8E0D0]">
            welcome to the Twin Cities music scene
          </p>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/65">
            No algorithms <span className="text-[#E8E0D0]/30">/</span> No ads{" "}
            <span className="text-[#E8E0D0]/30">/</span> No corporate overlords
          </p>
          <p className="mt-1.5 text-[13px] text-[#E8E0D0]/70">
            Created and maintained by Alex at{" "}
            <a
              href="https://thebirdhaus.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#E8E0D0]"
            >
              the Birdhaus
            </a>
          </p>
        </div>
      </header>

      <div
        role="status"
        className="mb-6 flex items-start gap-3 rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-[#E8E0D0]/90"
      >
        <span
          aria-hidden
          className="mt-0.5 shrink-0 rounded bg-[#E8B84B]/20 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#E8B84B]"
        >
          Beta
        </span>
        <p className="m-0">
          This site is in early beta — lots of in-progress sections and
          half-finished ideas. Hit up alex@thebirdhaus.org with any comments/suggestions!
        </p>
        {SHOWS_ENABLED && (
          <Link
            href={adminHref}
            className="mt-0.5 shrink-0 self-start rounded border border-[#E8E0D0]/20 px-2 py-0.5 text-xs font-medium text-[#E8E0D0]/55 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]"
          >
            Admin
          </Link>
        )}
      </div>

      {/* Section nav. Bands, Playlists, and Venues are live; Shows is gated
          behind SHOWS_ENABLED. */}
      <nav className="mb-6 border-b border-[#E8E0D0]/20">
        <ul className="-mb-px flex flex-wrap items-end gap-x-6 gap-y-2">
          <li>
            <span
              aria-current="page"
              className="inline-block border-b-2 border-[#E8E0D0] px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]"
            >
              Bands
            </span>
          </li>
          <li>
            {SHOWS_ENABLED ? (
              <Link
                href="/shows"
                className="inline-block border-b-2 border-transparent px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]"
              >
                Shows
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]/35">
                Shows
                <span className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#E8E0D0]/50">
                  soon
                </span>
              </span>
            )}
          </li>
          <li>
            <Link
              href="/venues"
              className="inline-block border-b-2 border-transparent px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]"
            >
              Venues
            </Link>
          </li>
          <li>
            <Link
              href="/playlists"
              className="inline-block border-b-2 border-transparent px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0]"
            >
              Playlists
            </Link>
          </li>
        </ul>
      </nav>

      {/* Intro + primary CTA. Handed to BandGrid so it can sit in a column
          beside the search bar (keeps the band grid higher up the page). */}
      <BandGrid
        bands={bands}
        bandsWithUpcomingShows={SHOWS_ENABLED ? bandsWithUpcomingShows : undefined}
        intro={
          <>
            <p className="text-[13px] leading-relaxed text-[#E8E0D0]/75">
              <span className="font-semibold text-[#E8E0D0]">Bands</span> —
              search and filter to find yours; you might already be on here (i
              took most of the photos/initial info from your Instagram page,
              feel free to update/edit). Otherwise, add yourself!
            </p>
            <Link
              href="/submit"
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
            >
              + Add your band
            </Link>
          </>
        }
      />
    </main>
  );
}
