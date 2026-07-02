import Link from "next/link";
import type { Metadata } from "next";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { scrapePilllar } from "@/lib/scrapers/pilllar";
import { createMatcher } from "@/lib/bandMatcher";
import ShowImportReview, {
  type ImportShow,
} from "@/components/ShowImportReview";

// Admin-only tool: scrapes live and reads no-store data, so never cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import Shows — Twin Scene",
  robots: { index: false, follow: false },
};

/** Dedup key matching a scraped band-row against an existing sheet row. */
function showKey(slug: string, date: string, venue: string): string {
  return `${slug}::${date}::${venue.trim().toLowerCase()}`;
}

export default async function ImportShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  if (secret && provided !== secret) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
        <h1 className="text-xl font-medium">Not authorized</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/60">
          Append <code>?secret=…</code> to access the import tool.
        </p>
      </main>
    );
  }

  let shows: ImportShow[] = [];
  let error = "";
  try {
    const [bands, existing, scraped] = await Promise.all([
      fetchBands(),
      fetchShows(),
      scrapePilllar(),
    ]);

    const { matchShow } = createMatcher(bands);

    // Set of already-imported band-rows so we don't offer duplicates.
    const existingKeys = new Set(
      existing.map((s) => showKey(s.slug, s.date, s.venue)),
    );

    shows = scraped.map((show) => {
      const matched = matchShow(show);
      return {
        date: show.date,
        venue: show.venue,
        headliner: show.headliner,
        allBands: show.allBands,
        flyerUrl: show.flyerUrl,
        ticketUrl: show.ticketUrl,
        doorsTime: show.doorsTime,
        musicTime: show.musicTime,
        advancePrice: show.advancePrice,
        dosPrice: show.dosPrice,
        matches: matched.bandMatches
          // Only bands we can link to the directory are selectable; the rest
          // ride along in NOTES.
          .filter((m) => m.match)
          .map((m) => ({
            scrapedName: m.name,
            slug: m.match!.slug,
            bandName: m.match!.name,
            confidence: m.confidence as "auto" | "review",
            imported:
              !!show.date &&
              existingKeys.has(showKey(m.match!.slug, show.date, show.venue)),
          })),
      };
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to scrape shows";
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <Link
          href="/shows"
          className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
        >
          <span aria-hidden>←</span> Upcoming Shows
        </Link>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Import Shows — Pilllar Forum
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Scraped bills matched to directory bands. Confirm the matches, then
          import — approved shows are written to the Shows sheet and appear on
          the shows page.
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
          {error}
        </p>
      ) : (
        <ShowImportReview shows={shows} />
      )}
    </main>
  );
}
