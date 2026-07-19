// Scraper for The Birdhaus.
//
// The Birdhaus is our own venue. Its shows used to be hand-authored markdown
// files in a GitHub repo, read via the GitHub contents API — but Birdhaus
// migrated show management to its own admin dashboard, backed by a `shows`
// table in Birdhaus's own (separate) Neon Postgres database. We now read that
// table directly, via a dedicated connection (lib/birdhausDb.ts) — Birdhaus is
// on a physically different DB than Twin Scene's, see ARCHITECTURE.md.
//
// Two things differ from the HTML scrapers on purpose:
//   1. Past shows accumulate in Birdhaus's table (nothing prunes old rows),
//      whereas a venue's events page only lists upcoming shows. So we filter
//      to shows dated today-or-later ourselves in the query.
//   2. Band names here are typed by us, not read off a flyer, so exact matches
//      score 1.0 in the matcher and land in the 'auto' tier — this scraper's
//      review-queue rate should be near zero, unlike the flyer-based scrapers.

import { getBirdhausDb } from "../birdhausDb";
import type { ScrapedShow } from "./types";

const VENUE = "The Birdhaus";
const SHOW_PAGE_BASE = "https://thebirdhaus.org/shows";

// One row per show, with its lineup aggregated from show_bands/bands (sorted
// by sort_order) into a plain name array — mirrors the-birdhaus's
// bandsJoinFragment(), just projected straight to names since that's all a
// ScrapedShow needs.
type ShowRow = {
  slug: string;
  title: string;
  date: string;
  doors_time: string | null;
  show_time: string | null;
  flyer: string | null;
  ticket_url: string | null;
  external_ticket_url: string | null;
  band_names: string[] | null;
};

/** Today's date (YYYY-MM-DD) in the venue's timezone. */
function todayInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function rowToShow(row: ShowRow): ScrapedShow {
  // Drop TBA/TBD placeholders (mirroring the flyer scrapers) and de-duplicate
  // case-insensitively, keeping first-seen order/casing.
  const seen = new Set<string>();
  const allBands: string[] = [];
  for (const name of row.band_names ?? []) {
    if (!name || /^tb[ad]\.?$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    allBands.push(name);
  }
  const [headliner = null, ...supporting] = allBands;

  return {
    venue: VENUE,
    date: row.date,
    title: row.title?.trim() || null,
    headliner,
    supporting,
    allBands,
    flyerUrl: row.flyer || null,
    ticketUrl: row.ticket_url || row.external_ticket_url || null,
    doorsTime: row.doors_time?.trim() || null,
    musicTime: row.show_time?.trim() || null,
    advancePrice: null, // Birdhaus doesn't track prices
    dosPrice: null,
    sourceUrl: `${SHOW_PAGE_BASE}/${row.slug}`,
  };
}

export async function scrapeBirdhaus(): Promise<ScrapedShow[]> {
  const today = todayInChicago();
  const sql = getBirdhausDb();

  const rows = await sql<ShowRow[]>`
    select
      s.slug,
      s.title,
      s.date::text as date,
      s.doors_time,
      s.show_time,
      s.flyer,
      s.ticket_url,
      s.external_ticket_url,
      (
        select array_agg(b.name order by sb.sort_order)
        from show_bands sb
        join bands b on b.id = sb.band_id
        where sb.show_id = s.id
      ) as band_names
    from shows s
    where s.announced = true and s.date >= ${today}
    order by s.date asc
  `;

  return rows.map(rowToShow);
}
