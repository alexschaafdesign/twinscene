// Reconcile Crawl Space's daily "Complete Show List" against our own shows.
// Two products from one match (findShowMatch, the same fuzzy venue+date+
// headliner matcher the press-star pipeline uses):
//
//   - matched entries -> a genre/age *suggestion* to fill onto that show
//     (annotateShow, fill-only), and
//   - unmatched entries -> "Crawl Space lists this tonight, we don't have it"
//     — the missing-show signal surfaced on /admin/reconcile.
//
// analyzeCrawlSpace() is read-only (the admin page renders it live). The daily
// run calls reconcileCrawlSpace(), which additionally POSTs the suggestions to
// /api/shows/annotate so matched shows pick up genre/age overnight.

import { fetchShows, type Show } from "@/lib/fetchShows";
import { findShowMatch } from "@/lib/showMatcher";
import { scrapeCrawlSpaceComplete, CRAWLSPACE_PRESS_ID } from "./crawlspace";

export type ReconcileMatch = {
  id: string;
  title: string;
  venue: string;
  genres: string[];
  ageRestriction: string;
};

export type ReconcileEntry = {
  venue: string;
  date: string | null;
  headliner: string | null;
  allBands: string[];
  musicTime: string | null;
  ageRestriction: string | null;
  genres: string[];
  sourceUrl: string;
  match: ReconcileMatch | null; // the show on our list this refers to, if any
};

export type ReconcileReport = {
  ranAt: string;
  source: string;
  total: number; // entries parsed from Crawl Space
  matched: number; // entries that map to a show we have
  unmatched: number; // entries with no match (candidates we're missing)
  applied: number; // genre/age suggestions actually written (0 for analyze-only)
  entries: ReconcileEntry[];
};

/** Parse Crawl Space's complete list and match each entry to a show we have —
 * no writes. `shows` defaults to fetchShows() but can be passed in to share a
 * fetch with the caller. */
export async function analyzeCrawlSpace(shows?: Show[]): Promise<ReconcileReport> {
  const list = shows ?? (await fetchShows());
  const picks = await scrapeCrawlSpaceComplete();

  const entries: ReconcileEntry[] = picks.map((pick) => {
    const match = findShowMatch(pick, list);
    return {
      venue: pick.venue,
      date: pick.date,
      headliner: pick.headliner,
      allBands: pick.allBands,
      musicTime: pick.musicTime,
      ageRestriction: pick.ageRestriction ?? null,
      genres: pick.genres ?? [],
      sourceUrl: pick.sourceUrl,
      match: match
        ? {
            id: match.id,
            title: match.title,
            venue: match.venue,
            genres: match.genres,
            ageRestriction: match.ageRestriction,
          }
        : null,
    };
  });

  const matched = entries.filter((e) => e.match).length;
  return {
    ranAt: new Date().toISOString(),
    source: CRAWLSPACE_PRESS_ID,
    total: entries.length,
    matched,
    unmatched: entries.length - matched,
    applied: 0,
    entries,
  };
}

/** analyzeCrawlSpace + apply the genre/age suggestions to matched shows via
 * /api/shows/annotate (fill-only). Returns the report with `applied` set to how
 * many shows actually took a new value. */
export async function reconcileCrawlSpace(
  baseUrl: string,
  shows?: Show[],
): Promise<ReconcileReport> {
  const report = await analyzeCrawlSpace(shows);

  let applied = 0;
  for (const entry of report.entries) {
    if (!entry.match) continue;
    if (entry.genres.length === 0 && !entry.ageRestriction) continue;
    try {
      const res = await fetch(`${baseUrl}/api/shows/annotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.SCRAPE_SECRET,
          source: CRAWLSPACE_PRESS_ID,
          id: entry.match.id,
          genres: entry.genres,
          ageRestriction: entry.ageRestriction,
        }),
      });
      const data = await res.json();
      if (data.success && data.changed) applied++;
    } catch {
      // A single annotate failure shouldn't abort the rest of the run.
    }
  }

  return { ...report, applied };
}
