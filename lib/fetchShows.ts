// Data layer for upcoming shows.
//
// Shows now live in the Postgres `shows` table instead of the Google Sheet
// this file used to read directly as CSV. Every consumer (ShowsList,
// ShowsTimeline, band/venue profiles, the import review page, starPress)
// only ever sees the Show shape below, so this swap didn't require touching
// any rendering code. Write side lives in lib/shows.ts.

import { sql } from "@/lib/db";
import type { LineupEntry, StarredByEntry } from "@/lib/shows";
import { formatShowTime, parseDisplayTime } from "@/lib/showTime";

export type Show = {
  id: string; // stable per-row id used to target edits
  date: string; // "YYYY-MM-DD"
  venue: string;
  title: string; // optional editorial event name (subtitle), falling back to the lineup/venue — see lib/showDisplay.ts. The bands-forward heading is the lineup.
  lineup: string; // full lineup, e.g. "shugE, Average Joey, Ditch Pigeon" — the show's marquee/heading
  bandSlugs: string[]; // directory slugs this show links to (0..n)
  lineupEntries: LineupEntry[]; // raw name+bandSlug pairs, in order — for the show page, which renders each lineup name alongside its matched band's photo/bio (bandSlugs above is just the flattened slug list)
  eventType: string; // non-band listing label (e.g. "Private Event"), "" for shows
  notes: string;
  musicTime: string; // show start time, "7:00pm" ("" when unknown) — shows.music_time (0039)
  doorsTime: string; // doors time, "7:00pm" ("" when unknown) — shows.doors_time (0039)
  genres: string[]; // genre suggestions (Dakota/Crawl Space) — shows.genres (0040)
  ageRestriction: string; // "21+" / "All Ages" ("" when unknown) — shows.age_restriction (0040)
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
  music_time: string | null; // "HH24:MI" from to_char, or null
  doors_time: string | null;
  genres: string[] | null;
  age_restriction: string | null;
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
export function todayInChicago(): string {
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
    lineupEntries: lineup,
    eventType: row.event_type ?? "",
    notes: row.notes ?? "",
    musicTime: formatShowTime(row.music_time) ?? "",
    doorsTime: formatShowTime(row.doors_time) ?? "",
    genres: row.genres ?? [],
    ageRestriction: row.age_restriction ?? "",
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

// One show by id, for the per-show page (/shows/[id]). No confidence/date
// filtering — a direct link to a specific show should resolve even if it's a
// 'broken'-flagged or already-past row; the page renders whatever exists.
export async function fetchShowById(id: string): Promise<Show | null> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE id = ${id}
    `;
  } catch (err) {
    console.error("fetchShowById: query failed", err);
    return null;
  }
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function fetchShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
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
    .sort(byDateThenTime);
}

/** Sort by date, then by start time within a day (earliest first), with
 * timeless shows last. Now that music_time is structured (0039), same-day
 * shows list in set-time order instead of arbitrary DB order. */
function byDateThenTime(a: Show, b: Show): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  // parseDisplayTime turns "7:00pm" back into 24h "HH:MM", which sorts
  // lexically; "" (no time) maps to a sentinel so it lands after real times.
  const at = parseDisplayTime(a.musicTime) ?? "99:99";
  const bt = parseDisplayTime(b.musicTime) ?? "99:99";
  return at.localeCompare(bt);
}

/**
 * Every show dated in the last `days` days, most recent first — the "Recent
 * shows" tab on /shows, so a show that's already happened is still reachable
 * (to mark "I went to this") even though fetchShows() drops it the moment its
 * date passes. Windowed rather than "everything past" (unlike
 * fetchAllShows()) to keep the query cheap as show history grows.
 */
export async function fetchPastShows(days: number): Promise<Show[]> {
  const today = todayInChicago();
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  const startStr = start.toISOString().slice(0, 10);

  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE confidence IS DISTINCT FROM 'broken' AND date >= ${startStr} AND date < ${today}
    `;
  } catch (err) {
    console.error("fetchPastShows: query failed", err);
    return [];
  }

  return rows.map(mapRow).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Every past show, any age, most recent first — unlike fetchPastShows(), not
 * windowed to the last N days. Used by the venue profile page's "Past shows"
 * tab, which wants a venue's full history rather than just a recent slice.
 */
export async function fetchAllPastShows(): Promise<Show[]> {
  const today = todayInChicago();

  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons
      FROM shows
      WHERE confidence IS DISTINCT FROM 'broken' AND date < ${today}
    `;
  } catch (err) {
    console.error("fetchAllPastShows: query failed", err);
    return [];
  }

  return rows.map(mapRow).sort((a, b) => b.date.localeCompare(a.date));
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
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
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

/** Whether a show id exists — used by the attendance-status route to 404
 * instead of hitting the show_saves FK constraint on a bad id. */
export async function showExists(id: string): Promise<boolean> {
  const [row] = await sql`select 1 from shows where id = ${id} limit 1`;
  return !!row;
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
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
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
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
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
