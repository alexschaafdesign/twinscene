// Reconcile a press outlet's "complete list" post against our own shows. Two
// products from one match (findShowMatch, the same fuzzy venue+date+headliner
// matcher the press-star pipeline uses):
//
//   - matched entries -> a genre/age *suggestion* to fill onto that show
//     (annotateShow, fill-only), when the source provides genre/age (Crawl
//     Space does; Racket's plain listings don't, so its matched entries never
//     have anything to fill), and
//   - unmatched entries -> "this outlet lists it, we don't have it" — the
//     missing-show signal surfaced on /admin/reconcile.
//
// Registered sources below: Crawl Space's Complete Show List (tonight only)
// and Racket's weekly calendar (a ~7-day range). Each produces its own
// ReconcileReport rather than one merged report, since their date scope
// differs. analyzeCompleteList()/analyzeAllCompleteLists() are read-only (the
// admin page renders them live). The daily run calls
// reconcileAllCompleteLists(), which additionally POSTs suggestions to
// /api/shows/annotate so matched shows pick up genre/age overnight.

import { fetchShows, type Show } from "@/lib/fetchShows";
import { findShowMatch } from "@/lib/showMatcher";
import { scrapeCrawlSpaceComplete, CRAWLSPACE_PRESS_ID } from "./crawlspace";
import { scrapeRacketComplete, RACKET_PRESS_ID } from "./racket";
import type { ScrapedShow } from "./types";

export type CompleteListSource = {
  id: string;
  name: string;
  scrape: () => Promise<ScrapedShow[]>;
};

// Add an outlet here once it has a scrapeXComplete() parser.
export const COMPLETE_LIST_SOURCES: CompleteListSource[] = [
  { id: CRAWLSPACE_PRESS_ID, name: "crawl space", scrape: scrapeCrawlSpaceComplete },
  { id: RACKET_PRESS_ID, name: "racket", scrape: scrapeRacketComplete },
];

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
  name: string;
  total: number; // entries parsed from the outlet
  matched: number; // entries that map to a show we have
  unmatched: number; // entries with no match (candidates we're missing)
  applied: number; // genre/age suggestions actually written (0 for analyze-only)
  entries: ReconcileEntry[];
};

/** Parse one outlet's complete list and match each entry to a show we have —
 * no writes. `shows` defaults to fetchShows() but can be passed in to share a
 * fetch across sources/callers. */
export async function analyzeCompleteList(
  source: CompleteListSource,
  shows?: Show[],
): Promise<ReconcileReport> {
  const list = shows ?? (await fetchShows());
  const picks = await source.scrape();

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
    source: source.id,
    name: source.name,
    total: entries.length,
    matched,
    unmatched: entries.length - matched,
    applied: 0,
    entries,
  };
}

/** analyzeCompleteList + apply the genre/age suggestions to matched shows via
 * /api/shows/annotate (fill-only). Returns the report with `applied` set to how
 * many shows actually took a new value. Sources with no genre/age (Racket)
 * simply never have anything to apply. */
export async function reconcileCompleteList(
  source: CompleteListSource,
  baseUrl: string,
  shows?: Show[],
): Promise<ReconcileReport> {
  const report = await analyzeCompleteList(source, shows);

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
          source: source.id,
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

/** Every registered source's report, read-only. One failing outlet must not
 * blank the others — a scrape/parse error yields an empty report instead. */
export async function analyzeAllCompleteLists(shows?: Show[]): Promise<ReconcileReport[]> {
  const list = shows ?? (await fetchShows());
  const results = await Promise.allSettled(
    COMPLETE_LIST_SOURCES.map((source) => analyzeCompleteList(source, list)),
  );
  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    const source = COMPLETE_LIST_SOURCES[i];
    return {
      ranAt: new Date().toISOString(),
      source: source.id,
      name: source.name,
      total: 0,
      matched: 0,
      unmatched: 0,
      applied: 0,
      entries: [],
    };
  });
}

/** Every registered source, reconciled (analyzed + suggestions applied). */
export async function reconcileAllCompleteLists(
  baseUrl: string,
  shows?: Show[],
): Promise<ReconcileReport[]> {
  const list = shows ?? (await fetchShows());
  const results = await Promise.allSettled(
    COMPLETE_LIST_SOURCES.map((source) => reconcileCompleteList(source, baseUrl, list)),
  );
  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    const source = COMPLETE_LIST_SOURCES[i];
    return {
      ranAt: new Date().toISOString(),
      source: source.id,
      name: source.name,
      total: 0,
      matched: 0,
      unmatched: 0,
      applied: 0,
      entries: [],
    };
  });
}
