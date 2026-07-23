// Data layer for upcoming shows.
//
// Shows now live in the Postgres `shows` table instead of the Google Sheet
// this file used to read directly as CSV. Every consumer (ShowsList,
// ShowsTimeline, band/venue profiles, the import review page, starPress)
// only ever sees the Show shape below, so this swap didn't require touching
// any rendering code. Write side lives in lib/shows.ts.

import { sql } from "@/lib/db";
import type { LineupEntry, StarredByEntry } from "@/lib/shows";
import { formatShowTime, parseDisplayTime, showStartTime } from "@/lib/showTime";

export type Show = {
  id: string; // stable per-row id used to target edits
  date: string; // "YYYY-MM-DD"
  venue: string;
  title: string; // optional editorial event name (subtitle), falling back to the lineup/venue — see lib/showDisplay.ts. The bands-forward heading is the lineup.
  lineup: string; // full lineup, e.g. "shugE, Average Joey, Ditch Pigeon" — the show's marquee/heading
  bandSlugs: string[]; // directory slugs this show links to (0..n)
  // The subset of bandSlugs whose band is LOCAL (migration 0059) — i.e. not
  // explicitly 'touring'. An unclassified band counts as local, so this is
  // bandSlugs minus the explicitly-touring ones. Drives the shows badge: a show
  // with ≥1 local band is a "Scene bands" show; one whose matched bands are ALL
  // touring gets the muted "Touring" badge instead. Populated by annotateLocality
  // on the public read paths; defaults to a copy of bandSlugs (all-local) on
  // paths that skip annotation, matching the unclassified→local rule.
  localBandSlugs: string[];
  lineupEntries: LineupEntry[]; // raw name+bandSlug pairs, in order — for the show page, which renders each lineup name alongside its matched band's photo/bio (bandSlugs above is just the flattened slug list)
  eventType: string; // non-band listing label (e.g. "Private Event"), "" for shows
  notes: string;
  musicTime: string; // show start time, "7:00pm" ("" when unknown) — shows.music_time (0039)
  doorsTime: string; // doors time, "7:00pm" ("" when unknown) — shows.doors_time (0039)
  genres: string[]; // genre suggestions (Dakota/Crawl Space) — shows.genres (0040)
  ageRestriction: string; // "21+" / "All Ages" ("" when unknown) — shows.age_restriction (0040)
  description: string; // long-form event description, when the source has one ("" when none) — shows.description (0046)
  similarTo: string; // "for fans of" pull-quote ("" when none) — shows.similar_to (0046)
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
  hidden: boolean; // migration 0052 — an admin archived this show; held out of every public read
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
  description: string | null;
  similar_to: string | null;
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
  hidden_at: Date | null;
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

  const bandSlugs = lineup
    .map((e) => e.bandSlug)
    .filter((slug): slug is string => !!slug);

  return {
    id: row.id,
    date: row.date,
    venue: row.venue_name,
    title: row.title,
    lineup: lineup.map((e) => e.name).join(", "),
    bandSlugs,
    // Default: every matched band counts as local (the unclassified→local rule),
    // until annotateLocality refines it on the public read paths.
    localBandSlugs: [...bandSlugs],
    lineupEntries: lineup,
    eventType: row.event_type ?? "",
    notes: row.notes ?? "",
    musicTime: formatShowTime(row.music_time) ?? "",
    doorsTime: formatShowTime(row.doors_time) ?? "",
    genres: row.genres ?? [],
    ageRestriction: row.age_restriction ?? "",
    description: row.description ?? "",
    similarTo: row.similar_to ?? "",
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
    hidden: !!row.hidden_at,
  };
}

/**
 * Refine each show's localBandSlugs by looking up which of its matched bands are
 * explicitly 'touring' (migration 0059) and removing them — so localBandSlugs
 * ends up as the local (+ unclassified) subset. One query for the whole batch,
 * keyed on the union of referenced slugs. Best-effort: on failure the shows keep
 * their all-local default (every matched band treated as local), which is the
 * safe direction (a scene show never silently loses its badge).
 */
async function annotateLocality<T extends Show>(shows: T[]): Promise<T[]> {
  const slugs = [...new Set(shows.flatMap((s) => s.bandSlugs))];
  if (slugs.length === 0) return shows;

  let touring = new Set<string>();
  try {
    const rows = await sql<{ slug: string }[]>`
      SELECT slug FROM bands WHERE slug = ANY(${slugs}) AND locality = 'touring'
    `;
    touring = new Set(rows.map((r) => r.slug));
  } catch (err) {
    console.error("annotateLocality: query failed", err);
    return shows; // keep the all-local default
  }

  if (touring.size === 0) return shows; // nothing to strip
  for (const s of shows) {
    s.localBandSlugs = s.bandSlugs.filter((slug) => !touring.has(slug));
  }
  return shows;
}

// One show by id, for the per-show page (/shows/[id]). No confidence/date
// filtering — a direct link to a specific show should resolve even if it's a
// 'broken'-flagged or already-past row; the page renders whatever exists. The
// one exception is hidden_at: an admin-archived show is held out here too, so a
// hidden show's direct link 404s like any other non-public row.
export async function fetchShowById(id: string): Promise<Show | null> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
      FROM shows
      WHERE id = ${id} AND hidden_at IS NULL
    `;
  } catch (err) {
    console.error("fetchShowById: query failed", err);
    return null;
  }
  if (!rows[0]) return null;
  const [show] = await annotateLocality([mapRow(rows[0])]);
  return show;
}

export async function fetchShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
      FROM shows
      WHERE confidence IS DISTINCT FROM 'broken' AND hidden_at IS NULL
    `;
  } catch (err) {
    console.error("fetchShows: query failed", err);
    return [];
  }

  const today = todayInChicago();
  const shows = rows
    .map(mapRow)
    .filter((show) => show.date && show.date >= today)
    .sort(byDateThenTime);
  return annotateLocality(shows);
}

/** Sort by date, then by start time within a day (earliest first), with
 * timeless shows last. Now that music_time is structured (0039), same-day
 * shows list in set-time order instead of arbitrary DB order. */
function byDateThenTime(a: Show, b: Show): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  // parseDisplayTime turns "7:00pm" back into 24h "HH:MM", which sorts
  // lexically; "" (no time) maps to a sentinel so it lands after real times.
  // showStartTime falls back to the time embedded in notes, since the
  // structured music_time/doors_time columns are almost always empty today.
  const at = parseDisplayTime(showStartTime(a)) ?? "99:99";
  const bt = parseDisplayTime(showStartTime(b)) ?? "99:99";
  return at.localeCompare(bt);
}

/**
 * Every past show, any age, most recent first. Backs the /shows page's
 * "Archive" tab (the browsable full show history) and the venue profile
 * page's "Past shows" tab.
 */
export async function fetchAllPastShows(): Promise<Show[]> {
  const today = todayInChicago();

  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, to_char(music_time, 'HH24:MI') AS music_time, to_char(doors_time, 'HH24:MI') AS doors_time,
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
      FROM shows
      WHERE confidence IS DISTINCT FROM 'broken' AND hidden_at IS NULL AND date < ${today}
    `;
  } catch (err) {
    console.error("fetchAllPastShows: query failed", err);
    return [];
  }

  return annotateLocality(
    rows.map(mapRow).sort((a, b) => b.date.localeCompare(a.date)),
  );
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
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
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
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
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
        genres, age_restriction, description, similar_to,
        ticket_url, flyer_url, event_type, source, source_key, starred_by, created_at,
        needs_review, confidence, review_reasons, hidden_at
      FROM shows
      WHERE needs_review = true
    `;
  } catch (err) {
    console.error("fetchFlaggedShows: query failed", err);
    return [];
  }

  return rows.map(mapRow).sort((a, b) => a.date.localeCompare(b.date));
}
