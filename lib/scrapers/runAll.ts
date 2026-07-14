// Run every registered scraper, auto-import high-confidence shows, queue the
// rest for human review, and produce a digest summary.
//
// Shared by the on-demand endpoint (/api/scrape/all) and the Vercel cron
// endpoint (/api/cron/scrape) so both behave identically.

import { fetchBands } from "@/lib/fetchBands";
import { createMatcher, type MatchedShow } from "@/lib/bandMatcher";
import { getAllScrapers, type Scraper } from "@/lib/scrapers";
import { autoImportShow } from "@/lib/scrapers/autoImport";
import {
  runAllPressStars,
  type PressStarResult,
} from "@/lib/scrapers/starPress";
import { AUTO_IMPORT_ALL_SHOWS } from "@/lib/features";

export type ScraperDigest = {
  id: string;
  name: string;
  total: number; // shows scraped
  added: number; // brand-new shows inserted
  updated: number; // shows we already had, re-written from this scrape
  skipped: number; // shows we already had but left alone (human-edited/locked)
  failed: number; // imports that errored after retries
  autoImported: number; // added + updated (rows actually written) — kept for back-compat
  queued: number;
  newBandsFound: string[]; // scraped band names that matched nothing ('none')
  error?: string;
};

export type DigestSummary = {
  ranAt: string;
  scrapers: ScraperDigest[];
  totalAdded: number;
  totalUpdated: number;
  totalSkipped: number;
  totalFailed: number;
  totalAutoImported: number;
  totalQueued: number;
  totalNewBands: number;
  // Not a venue scraper's output — every registered Press outlet's picks
  // matched (and starred) against shows already on our list. Runs only from
  // runAllScrapers, so it's absent from a single-venue "Run now". Not folded
  // into the emailed digest above; visible via this JSON response.
  pressStars?: PressStarResult[];
};

// Cap how many imports are in flight at once and retry a few times on
// failure — imports upsert by sourceKey, so a retry is harmless.
const IMPORT_CONCURRENCY = 4;
const IMPORT_RETRIES = 2;

/** Sleep helper for retry backoff. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Import one show, retrying a few times on failure with a short backoff. */
async function importWithRetry(
  show: MatchedShow,
  scraperId: string,
  baseUrl: string,
): Promise<Awaited<ReturnType<typeof autoImportShow>>> {
  let last: Awaited<ReturnType<typeof autoImportShow>> = {
    success: false,
    error: "not attempted",
  };
  for (let attempt = 0; attempt <= IMPORT_RETRIES; attempt++) {
    last = await autoImportShow(show, scraperId, baseUrl);
    if (last.success) return last;
    if (attempt < IMPORT_RETRIES) await delay(300 * (attempt + 1));
  }
  return last;
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** A show auto-imports when it links no bands, or every band match is 'auto'. */
function isAutoShow(show: MatchedShow): boolean {
  if (show.allBands.length === 0) return true;
  return (
    show.bandMatches.length > 0 &&
    show.bandMatches.every((m) => m.confidence === "auto")
  );
}

export async function runAllScrapers(
  baseUrl: string,
  scrapers: Scraper[] = getAllScrapers(),
): Promise<DigestSummary> {
  // The full run (cron / "Run all") emails the digest. Callers can pass a
  // subset — the cron passes getCronScrapers() to skip localOnly venues.
  const summary = await runScrapers(scrapers, { notify: true, baseUrl });

  try {
    summary.pressStars = await runAllPressStars(baseUrl);
  } catch (err) {
    console.error("runAllPressStars failed", err);
  }

  return summary;
}

/**
 * Run a specific set of scrapers: scrape, auto-import high-confidence shows,
 * queue the rest, log the digest. `runAllScrapers` is this over every scraper;
 * the per-venue admin "Run now" is this over one, so both import and log
 * identically (only the scope differs). `notify` controls the digest email —
 * on for the daily run, off for a manual single-venue run. `baseUrl` is this
 * deployment's own origin, used to call the internal /api/scrapers/import
 * route (server-to-server, same app).
 */
export async function runScrapers(
  scrapers: Scraper[],
  opts: { notify?: boolean; baseUrl: string },
): Promise<DigestSummary> {
  const notify = opts.notify ?? false;
  const baseUrl = opts.baseUrl;
  // The Scraper Log tab is a separate, unmigrated sheet (run history + newly
  // discovered bands) — still logged via Apps Script.
  const submitUrl = process.env.NEXT_PUBLIC_SUBMIT_SCRIPT_URL;

  // Fetch the directory and build the fuzzy matcher once, shared across every
  // scraper's shows.
  const bands = await fetchBands();
  const { matchShow } = createMatcher(bands);

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
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
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
    // With AUTO_IMPORT_ALL_SHOWS on, everything imports and nothing is queued;
    // otherwise only high-confidence shows import and the rest await review.
    const autoShows = AUTO_IMPORT_ALL_SHOWS ? shows : shows.filter(isAutoShow);
    const reviewShows = AUTO_IMPORT_ALL_SHOWS
      ? []
      : shows.filter((s) => !isAutoShow(s));

    // Auto-import the high-confidence shows, tallying the import route's
    // per-show disposition so the digest can say "N added, N updated, N
    // already had" instead of one opaque count. A locked/edited row comes back
    // "skipped" (a human edit won); a row that errored past its retries is a
    // failure, not an import.
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    if (autoShows.length > 0) {
      const outcomes = await mapWithConcurrency(
        autoShows,
        IMPORT_CONCURRENCY,
        (show) => importWithRetry(show, scraper.id, baseUrl),
      );
      for (const o of outcomes) {
        if (!o.success) failed++;
        else if (o.outcome === "created") added++;
        else if (o.outcome === "updated") updated++;
        else if (o.outcome === "skipped") skipped++;
        else added++; // success without an outcome (older route) — treat as added
      }
    }
    const autoImported = added + updated;

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
      added,
      updated,
      skipped,
      failed,
      autoImported,
      queued: reviewShows.length,
      newBandsFound,
    });
  }

  const summary: DigestSummary = {
    ranAt: new Date().toISOString(),
    scrapers: digest,
    totalAdded: digest.reduce((n, s) => n + s.added, 0),
    totalUpdated: digest.reduce((n, s) => n + s.updated, 0),
    totalSkipped: digest.reduce((n, s) => n + s.skipped, 0),
    totalFailed: digest.reduce((n, s) => n + s.failed, 0),
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
          notify: notify ? "true" : "false",
        }),
      });
    } catch {
      // Never let a logging failure fail the run — the summary is still returned.
    }
  }

  return summary;
}
