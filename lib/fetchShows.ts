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
  notes: string;
  link: string;
  flyerUrl: string; // scraped poster image URL ("" when none)
  source: string; // "manual" | "pilllar" | …
  sourceKey: string; // stable dedup key for scraped shows
  added: string;
  starredBy: string[]; // curator/outlet ids that recommended this show
  starredNotes: Record<string, StarredNote>; // outlet id -> their blurb/source link, when given
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
  source: string;
  source_key: string;
  starred_by: StarredByEntry[] | null;
  created_at: Date;
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
  };
}

export async function fetchShows(): Promise<Show[]> {
  let rows: ShowsQueryRow[];
  try {
    rows = await sql<ShowsQueryRow[]>`
      SELECT
        id, to_char(date, 'YYYY-MM-DD') AS date, venue_name, title, lineup,
        notes, ticket_url, flyer_url, source, source_key, starred_by, created_at
      FROM shows
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
