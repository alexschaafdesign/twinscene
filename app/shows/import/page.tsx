import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import { fetchBands } from "@/lib/fetchBands";
import { fetchShows } from "@/lib/fetchShows";
import { getAllScrapers, type ScrapedShow } from "@/lib/scrapers";
import { createMatcher } from "@/lib/bandMatcher";
import ShowImportReview, {
  type ImportShow,
} from "@/components/ShowImportReview";
import RelinkPanel, { type LinkSuggestion } from "@/components/RelinkPanel";

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

export default async function ImportShowsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/shows/import");
  if (!isAdmin(user)) return <NotAdmin />;

  // Handed to the import panels for their SCRAPE_SECRET-gated scrape/show API
  // calls; this page is is_admin-gated, so only admins receive it.
  const secret = process.env.SCRAPE_SECRET ?? "";

  let shows: ImportShow[] = [];
  let bandOptions: { slug: string; name: string }[] = [];
  const linkSuggestions: LinkSuggestion[] = [];
  let error = "";
  const scrapeErrors: string[] = [];
  try {
    const scrapers = getAllScrapers();
    const [bands, existing, ...scrapeResults] = await Promise.all([
      fetchBands(),
      fetchShows(),
      // One failing venue must not blank the whole page.
      ...scrapers.map((s) =>
        s.scrape().then(
          (value) => ({ ok: true as const, value }),
          (reason) => ({ ok: false as const, reason }),
        ),
      ),
    ]);

    bandOptions = bands
      .map((b) => ({ slug: b.slug, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const { matchShow, matchBand } = createMatcher(bands);
    const importedKeys = new Set(
      existing.map((s) => s.sourceKey).filter(Boolean),
    );

    // Relink sweep: scheduled shows whose lineup names a band that's now in the
    // directory but isn't linked yet (its slug not already in bandSlugs).
    for (const s of existing) {
      if (!s.id) continue; // need a stable id to target the row
      const linked = new Set(s.bandSlugs);
      const seen = new Set<string>();
      for (const name of s.lineup.split(",").map((n) => n.trim())) {
        if (!name) continue;
        const m = matchBand(name);
        if (
          m.match &&
          m.confidence !== "none" &&
          !linked.has(m.match.slug) &&
          !seen.has(m.match.slug)
        ) {
          seen.add(m.match.slug);
          linkSuggestions.push({
            showId: s.id,
            showTitle: s.title || name,
            date: s.date,
            venue: s.venue,
            scrapedName: name,
            bandSlug: m.match.slug,
            bandName: m.match.name,
            confidence: m.confidence,
          });
        }
      }
    }
    linkSuggestions.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    const mapShow = (scraperId: string, show: ScrapedShow): ImportShow => {
      const matched = matchShow(show);
      const headliner = show.headliner ?? show.allBands[0] ?? "";
      const sourceKey = `${scraperId}:${show.date ?? "nodate"}:${slugify(headliner)}`;

      const suggestedSlugs = new Set<string>();
      const suggested = matched.bandMatches
        .filter((m) => m.match)
        .map((m) => ({
          slug: m.match!.slug,
          name: m.match!.name,
          scrapedName: m.name,
          confidence: m.confidence as "auto" | "review",
        }))
        // Dedupe by slug: a lineup can list the same matched act twice.
        .filter((s) => !suggestedSlugs.has(s.slug) && suggestedSlugs.add(s.slug));

      // Scraped acts with no directory match — offered for one-click adding.
      // Deduped: a lineup can list the same act twice, which would otherwise
      // produce duplicate React keys and a repeated "add" row.
      const unmatched = [
        ...new Set(
          matched.bandMatches
            .filter((m) => m.confidence === "none")
            .map((m) => m.name),
        ),
      ];

      return {
        source: scraperId,
        sourceKey,
        date: show.date ?? "",
        venue: show.venue,
        title: show.title || headliner,
        lineup: show.allBands.join(", "),
        tag: show.tag ?? null,
        notes: composeNotes(show),
        link: show.ticketUrl ?? "",
        flyerUrl: show.flyerUrl,
        suggested,
        autoSlugs: suggested
          .filter((s) => s.confidence === "auto")
          .map((s) => s.slug),
        unmatched,
        alreadyImported: importedKeys.has(sourceKey),
      };
    };

    // Flatten every scraper's shows into one list, collecting per-venue errors
    // so a single failing venue still lets the others through.
    const collected: ImportShow[] = [];
    scrapeResults.forEach((result, i) => {
      const scraper = scrapers[i];
      if (!result.ok) {
        scrapeErrors.push(
          `${scraper.name}: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
        );
        return;
      }
      for (const show of result.value) collected.push(mapShow(scraper.id, show));
    });

    // Soonest first; undated shows sort last.
    collected.sort((a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999"),
    );
    shows = collected;
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
          Import Shows
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          Every scraped show across all venues. Edit any field, confirm which
          directory bands it links to, then add it to the schedule. Confirmed
          shows appear on the shows page (and on each linked band&apos;s
          profile).
        </p>
      </header>

      <RelinkPanel suggestions={linkSuggestions} secret={secret} />

      {scrapeErrors.length > 0 && (
        <ul className="mb-6 space-y-1 rounded-md border border-[#E8B84B]/40 bg-[#E8B84B]/10 px-3.5 py-2.5 text-sm text-[#E8E0D0]/90">
          {scrapeErrors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="rounded-md border border-[#E5A0A0]/40 bg-[#E5A0A0]/10 px-3.5 py-2.5 text-sm text-[#E5A0A0]">
          {error}
        </p>
      ) : (
        <ShowImportReview shows={shows} bandOptions={bandOptions} secret={secret} />
      )}
    </main>
  );
}
