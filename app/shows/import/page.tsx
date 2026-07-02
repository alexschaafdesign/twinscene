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

/** Lowercase/hyphenate for a stable dedup key. Mirrors slugify elsewhere. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Logistics-only NOTES default (lineup lives in its own field now). */
function composeNotes(show: {
  doorsTime: string | null;
  musicTime: string | null;
  advancePrice: number | null;
  dosPrice: number | null;
}): string {
  const parts: string[] = [];
  const times: string[] = [];
  if (show.doorsTime) times.push(`Doors ${show.doorsTime}`);
  if (show.musicTime) times.push(`Music ${show.musicTime}`);
  if (times.length) parts.push(times.join(" / "));
  const prices: string[] = [];
  if (show.advancePrice != null) prices.push(`$${show.advancePrice} adv`);
  if (show.dosPrice != null) prices.push(`$${show.dosPrice} dos`);
  if (prices.length) parts.push(prices.join(" / "));
  return parts.join(" · ");
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
  let bandOptions: { slug: string; name: string }[] = [];
  let error = "";
  try {
    const [bands, existing, scraped] = await Promise.all([
      fetchBands(),
      fetchShows(),
      scrapePilllar(),
    ]);

    bandOptions = bands
      .map((b) => ({ slug: b.slug, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const { matchShow } = createMatcher(bands);
    const importedKeys = new Set(
      existing.map((s) => s.sourceKey).filter(Boolean),
    );

    shows = scraped.map((show) => {
      const matched = matchShow(show);
      const headliner = show.headliner ?? show.allBands[0] ?? "";
      const sourceKey = `pilllar:${show.date ?? "nodate"}:${slugify(headliner)}`;

      const suggested = matched.bandMatches
        .filter((m) => m.match)
        .map((m) => ({
          slug: m.match!.slug,
          name: m.match!.name,
          scrapedName: m.name,
          confidence: m.confidence as "auto" | "review",
        }));

      return {
        sourceKey,
        date: show.date ?? "",
        venue: show.venue,
        title: headliner,
        lineup: show.allBands.join(", "),
        notes: composeNotes(show),
        link: show.ticketUrl ?? "",
        flyerUrl: show.flyerUrl,
        suggested,
        autoSlugs: suggested
          .filter((s) => s.confidence === "auto")
          .map((s) => s.slug),
        alreadyImported: importedKeys.has(sourceKey),
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
          Every scraped show. Edit any field, confirm which directory bands it
          links to, then add it to the schedule. Confirmed shows appear on the
          shows page (and on each linked band&apos;s profile).
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
          {error}
        </p>
      ) : (
        <ShowImportReview shows={shows} bandOptions={bandOptions} />
      )}
    </main>
  );
}
