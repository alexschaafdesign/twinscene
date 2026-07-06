import Link from "next/link";
import { fetchBands } from "@/lib/fetchBands";
import BandGrid from "@/components/BandGrid";
import { SHOWS_ENABLED } from "@/lib/features";

// The home page: the band directory. It's the site's only section for now, so
// it lives at the root. Individual profiles are at /bands/[slug]; a dedicated
// /bands index can be added later alongside sibling sections (/venues, …).
export default async function Home() {
  const bands = await fetchBands();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div
        role="status"
        className="mb-8 flex items-start gap-3 rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-4 py-3 text-sm leading-relaxed text-[#E8E0D0]/90"
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
      </div>

      <header className="mb-8">
        <div className="grid grid-cols-1 items-center gap-8 sm:grid-cols-2 sm:gap-10">
          <div className="text-center sm:text-right">
            <p className="mt-0 text-2xl font-medium text-[#E8E0D0]">
              welcome to the Twin Cities music scene
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#E8E0D0]/65">
              No algorithms <span className="text-[#E8E0D0]/30">/</span> No ads{" "}
              <span className="text-[#E8E0D0]/30">/</span> No corporate overlords
            </p>
            <p className="mt-3 text-sm text-[#E8E0D0]/70">
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

          <h1 className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Twin Scene"
              className="mx-auto block w-full max-w-xs sm:mx-0"
            />
          </h1>
        </div>
      </header>

      {/* Section nav. Only Bands is live; Shows/Venues are placeholders until
          their sections ship (Shows is gated behind SHOWS_ENABLED). */}
      <nav className="mb-10 border-b border-[#E8E0D0]/20">
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
            <span className="inline-flex items-center gap-1.5 px-1 pb-3 text-sm font-semibold uppercase tracking-wide text-[#E8E0D0]/35">
              Venues
              <span className="rounded bg-[#E8E0D0]/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#E8E0D0]/50">
                soon
              </span>
            </span>
          </li>
          <li className="ml-auto pb-3 text-xs italic text-[#E8E0D0]/45">
            More sections coming soon
          </li>
        </ul>
      </nav>

      {/* Intro + primary CTA, sitting directly above the search field. */}
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <p className="max-w-xl text-sm leading-relaxed text-[#E8E0D0]/75">
          <span className="font-semibold text-[#E8E0D0]">Bands</span> — search
          below, you might already be on here (i took most of the photos/initial info from your Instagram page, feel free to update/edit). Otherwise, add yourself!
        </p>
        <Link
          href="/submit"
          className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
        >
          + Add your band
        </Link>
      </div>

      <BandGrid bands={bands} />
    </main>
  );
}
