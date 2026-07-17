// Data layer for upcoming shows.
//
// Shows now live in the Postgres `shows` table instead of the Google Sheet
// this file used to read directly as CSV. Every consumer (ShowsList,
// ShowsTimeline, band/venue profiles, the import review page, starPress)
// only ever sees the Show shape below, so this swap didn't require touching
// any rendering code. Write side lives in lib/shows.ts.

import { sql } from "@/lib/db";
import type { LineupEntry, StarredByEntry } from "@/lib/shows";

export type Show = {
  id: string; // stable per-row id used to target edits
  date: string; // "YYYY-MM-DD"
  venue: string;
  title: string; // marquee / headliner — the show's display title
  lineup: string; // full lineup, e.g. "shugE, Average Joey, Ditch Pigeon"
  bandSlugs: string[]; // directory slugs this show links to (0..n)
  eventType: string; // non-band listing label (e.g. "Private Event"), "" for shows
  notes: string;
  link: string;
  flyerUrl: string; // scraped poster image URL ("" when none)
  source: string; // "manual" | "pilllar" | …
  sourceKey: string; // stable dedup key for scraped shows
  added: string;
  starredBy: string[]; // curator/outlet ids that recommended this show
  starredNotes: Record<string, StarredNote>; // outlet id -> their blurb/source link, when given
  needsReview: boolean; // data-quality flag (lib/scrapers/reviewFlags.ts) — still shown publicly
  confidence: string; // "ok" | "flag" | "broken" — "broken" rows are held out of fetchShows()
  reviewReasons: string[];
};

export type StarredNote = { blurb: string; url: string };

type ShowsQueryRow = {
  id: string;
  date: string;
  venue_name: string;
  title: string;
  lineup: LineupEntry[] | null;
  notes: string | null;
  ticket_url: string | null;
  flyer_url: string | null;
  event_type: string | null;
  source: string;
  source_key: string;
  starred_by: StarredByEntry[] | null;
  created_at: Date;
  needs_review: boolean | null;
  confidence: string | null;
  review_reasons: string[] | null;
};

/** Today's date as "YYYY-MM-DD" in America/Chicago (en-CA yields ISO order). */
function todayInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function mapRow(row: ShowsQueryRow): Show {
  const lineup = row.lineup ?? [];
  const starredBy = row.starred_by ?? [];

  return {
    id: row.id,
    date: row.date,
    venue: row.venue_name,
    title: row.title,
    lineup: lineup.map((e) => e.name).join(", "),
    bandSlugs: lineup
      .map((e) => e.bandSlug)
      .filter((slug): slug is string => !!slug),
    eventType: row.event_type ?? "",
    notes: row.notes ?? "",
    link: row.ticket_url ?? "",
    flyerUrl: row.flyer_url ?? "",
    source: row.source,
    sourceKey: row.source_key,
    added: row.created_at.toISOString().slice(0, 10),
    starredBy: starredBy.map((s) => s.outlet),
    starredNotes: Object.fromEntries(
      starredBy.map((s) => [s.outlet, { blurb: s.blurb, url: s.url }]),
    ),
    needsReview: row.needs_review ?? false,
    confidence: row.confidence ?? "ok",
    reviewReasons: row.review_reasons ?? [],
  };
}

export async function fetchShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE confidence IS DISTINCT FROM 'broken'
    `;
  } catch (err) {
    console.error("fetchShows: query failed", err);
    return [];
  }

  const today = todayInChicago();
  return rows
    .map(mapRow)
    .filter((show) => show.date && show.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Today + the next `days - 1` days, both as "YYYY-MM-DD" (America/Chicago). */
export function reviewWindow(days: number): { start: string; end: string } {
  const start = todayInChicago();
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + (days - 1));
  return { start, end: end.toISOString().slice(0, 10) };
}

/**
 * Every show in the next `days` days (inclusive of today) — unlike
 * fetchShows(), this doesn't exclude "broken" (no usable date) rows or
 * anything else, since /admin/review exists specifically to catch and fix
 * those.
 */
export async function fetchShowsForReview(days: number): Promise<Show[]> {
  const { start, end } = reviewWindow(days);

  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE date BETWEEN ${start} AND ${end}
    `;
  } catch (err) {
    console.error("fetchShowsForReview: query failed", err);
    return [];
  }

  return rows.map(mapRow).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every show in the table, any date or confidence — for /admin/shows, which
 * exists so admins can find and delete arbitrary rows (old junk, past
 * mistakes) that fetchShows()'s upcoming-only filter would otherwise hide.
 * Sorted newest-date-first so upcoming/recent shows surface before old ones.
 */
export async function fetchAllShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      ORDER BY date DESC
    `;
  } catch (err) {
    console.error("fetchAllShows: query failed", err);
    return [];
  }

  return rows.map(mapRow);
}

/**
 * Every needs_review show, any date — scrapers pull shows months out, so a
 * flag on a show outside fetchShowsForReview's window would otherwise never
 * be reachable from /admin/review. This is how "why is X flagged" stays
 * answerable no matter how far out the show is.
 */
export async function fetchFlaggedShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE needs_review = true
    `;
  } catch (err) {
    console.error("fetchFlaggedShows: query failed", err);
    return [];
  }

  return rows.map(mapRow).sort((a, b) => a.date.localeCompare(b.date));
}
