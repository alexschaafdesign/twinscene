// Run every registered scraper, auto-import high-confidence shows, queue the
// rest for human review, and produce a digest summary.
//
// Shared by the on-demand endpoint (/api/scrape/all) and the Vercel cron
// endpoint (/api/cron/scrape) so both behave identically.

import { fetchBands } from "@/lib/fetchBands";
import { createMatcher, type MatchedShow } from "@/lib/bandMatcher";
import { getAllScrapers } from "@/lib/scrapers";
import { autoImportShow } from "@/lib/scrapers/autoImport";

export type ScraperDigest = {
  id: string;
  name: string;
  total: number;
  autoImported: number;
  queued: number;
  newBandsFound: string[]; // scraped band names that matched nothing ('none')
  error?: string;
};

export type DigestSummary = {
  ranAt: string;
  scrapers: ScraperDigest[];
  totalAutoImported: number;
  totalQueued: number;
  totalNewBands: number;
};

/** A show auto-imports when it links no bands, or every band match is 'auto'. */
function isAutoShow(show: MatchedShow): boolean {
  if (show.allBands.length === 0) return true;
  return (
    show.bandMatches.length > 0 &&
    show.bandMatches.every((m) => m.confidence === "auto")
  );
}

export async function runAllScrapers(): Promise<DigestSummary> {
  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;

  // Fetch the directory and build the fuzzy matcher once, shared across every
  // scraper's shows.
  const bands = await fetchBands();
  const { matchShow } = createMatcher(bands);

  const scrapers = getAllScrapers();

  // One failing scraper must not block the others.
  const results = await Promise.allSettled(
    scrapers.map(async (scraper) => {
      const scraped = await scraper.scrape();
      return scraped.map(matchShow);
    }),
  );

  const digest: ScraperDigest[] = [];

  for (let i = 0; i < scrapers.length; i++) {
    const scraper = scrapers[i];
    const result = results[i];

    if (result.status === "rejected") {
      digest.push({
        id: scraper.id,
        name: scraper.name,
        total: 0,
        autoImported: 0,
        queued: 0,
        newBandsFound: [],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
      continue;
    }

    const shows = result.value;
    const autoShows = shows.filter(isAutoShow);
    const reviewShows = shows.filter((s) => !isAutoShow(s));

    // Auto-import the high-confidence shows (only when we have somewhere to
    // send them). Count only the ones the Apps Script accepted.
    let autoImported = 0;
    if (submitUrl && autoShows.length > 0) {
      const outcomes = await Promise.all(
        autoShows.map((show) => autoImportShow(show, scraper.id, submitUrl)),
      );
      autoImported = outcomes.filter((o) => o.success).length;
    }

    // Distinct scraped band names that matched nothing — candidates to add to
    // the directory by hand.
    const newBandsFound = Array.from(
      new Set(
        shows.flatMap((s) =>
          s.bandMatches
            .filter((m) => m.confidence === "none")
            .map((m) => m.name),
        ),
      ),
    );

    digest.push({
      id: scraper.id,
      name: scraper.name,
      total: shows.length,
      autoImported,
      queued: reviewShows.length,
      newBandsFound,
    });
  }

  const summary: DigestSummary = {
    ranAt: new Date().toISOString(),
    scrapers: digest,
    totalAutoImported: digest.reduce((n, s) => n + s.autoImported, 0),
    totalQueued: digest.reduce((n, s) => n + s.queued, 0),
    totalNewBands: digest.reduce((n, s) => n + s.newBandsFound.length, 0),
  };

  // Log + email the digest via the Apps Script (formType 'scraperLog').
  if (submitUrl) {
    try {
      await fetch(submitUrl, {
        method: "POST",
        body: new URLSearchParams({
          formType: "scraperLog",
          summary: JSON.stringify(summary),
        }),
      });
    } catch {
      // Never let a logging failure fail the run — the summary is still returned.
    }
  }

  return summary;
}
