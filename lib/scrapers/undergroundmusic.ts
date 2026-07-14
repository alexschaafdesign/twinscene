// Scraper for Underground Music Venue.
//
// https://www.undergroundmusicvenue.com/events is a Squarespace page with two
// event sources that don't overlap, so both are pulled and merged:
//
//   1. A Dice.fm event-list widget carrying the bulk of the calendar. The
//      server HTML has no event markup — the widget renders client-side — but
//      it *does* carry the widget's init config (a partner apiKey + venue
//      filters). We read that config off the page and hand it to the shared
//      Dice fetch/mapping, exactly like zhora.ts.
//
//   2. A handful of bigger touring shows the venue sells through Skeletix
//      instead of Dice, hand-embedded as `promoter.skeletix.com/events/<id>/
//      embed` iframes. Those ids rotate as shows come and go, so they're parsed
//      out of the page rather than hardcoded. Each embed is a small card with a
//      title, a "Venue, City — Weekday, Mon DD, YYYY" line, a flyer image, and
//      a ticket link out to skeletix.com. That card is all this source exposes:
//      the underlying skeletix.com page renders doors/price client-side from an
//      API blob, not worth chasing for a few shows — so doors/music/price come
//      back null here and the lineup is split from the title (a trailing tour
//      name like ": Capital Punishment Tour" is dropped first). Past-dated
//      embeds the venue hasn't removed yet are skipped.
//
// Not localOnly — the Squarespace page, the Dice API, and the Skeletix embeds
// all respond to datacenter IPs, so the Vercel cron runs it fine.

import type { ScrapedShow } from "./types";
import { fetchDiceShows, extractDiceWidgetConfig } from "./dice";

const EVENTS_URL = "https://www.undergroundmusicvenue.com/events";
const VENUE = "Underground Music Venue";
const TIMEZONE = "America/Chicago";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "YYYY-MM-DD" for today in the venue's timezone (en-CA renders that shape). */
function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "…— Thu, Jul 30, 2026" → "2026-07-30". Null if no date is present. */
function parseCardDate(desc: string): string | null {
  const m = /([a-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/i.exec(desc);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

/** Split a title into act names: "w/"/"with" marks the headliner/support
 * boundary, then each side splits on the usual separators. Mirrors the other
 * title-based scrapers (acadia.ts, flyingv.ts). */
function splitBands(raw: string): string[] {
  const sides = raw.trim().split(/\s+w\/\s*|\s+with\s+/i);
  const names = sides.flatMap((side) =>
    side.split(/\s*\/\s*|\s+&\s+|\s*,\s*|\s+\+\s+/),
  );
  return names.map((n) => n.trim()).filter(Boolean);
}

/** Drop a trailing tour/festival name so it doesn't leak into the lineup:
 * "NASCAR ALOE + JASIAH: Capital Punishment Tour" → "NASCAR ALOE + JASIAH",
 * "OPAL IN SKY: Coming Back to America Tour" → "OPAL IN SKY". Only strips when
 * the part after the colon actually reads as a tour/fest name, so ordinary
 * "Band: something" titles are left alone. */
function stripTourSuffix(title: string): string {
  const i = title.indexOf(":");
  if (i > 0 && /\b(tour|fest|festival|presents)\b/i.test(title.slice(i + 1))) {
    return title.slice(0, i).trim();
  }
  return title.trim();
}

type SkeletixCard = {
  title: string;
  date: string | null;
  flyerUrl: string | null;
  ticketUrl: string | null;
};

/** Parse one Skeletix embed card (title, date line, flyer, ticket link). */
function parseSkeletixCard(html: string): SkeletixCard | null {
  const title = /class="card-title">([^<]*)</.exec(html)?.[1]?.trim();
  if (!title) return null;
  const desc = /class="card-desc">\s*([\s\S]*?)\s*<\/div>/.exec(html)?.[1] ?? "";
  const ticketUrl = /<a class="card"\s+href="([^"]*)"/.exec(html)?.[1] ?? null;
  const flyerUrl = /class="card-image[\s\S]*?<img src="([^"]*)"/.exec(html)?.[1] ?? null;
  return { title, date: parseCardDate(desc), flyerUrl, ticketUrl };
}

/** Fetch and parse the Skeletix embeds referenced on the events page. */
async function scrapeSkeletixEmbeds(pageHtml: string): Promise<ScrapedShow[]> {
  const embedUrls = [
    ...new Set(
      Array.from(
        pageHtml.matchAll(
          /https:\/\/promoter\.skeletix\.com\/events\/\d+\/embed/g,
        ),
        (m) => m[0],
      ),
    ),
  ];

  const today = todayLocal();

  const cards = await Promise.all(
    embedUrls.map(async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(
          `Underground Music Venue: Skeletix embed failed (${res.status} ${res.statusText}) ${url}`,
        );
      }
      return parseSkeletixCard(await res.text());
    }),
  );

  return cards
    .filter((c): c is SkeletixCard => c !== null)
    // Drop stale past-dated embeds the venue hasn't taken down yet.
    .filter((c) => c.date === null || c.date >= today)
    .map((c) => {
      const allBands = splitBands(stripTourSuffix(c.title));
      const [headliner, ...supporting] = allBands.length ? allBands : [c.title];
      return {
        venue: VENUE,
        date: c.date,
        headliner,
        supporting,
        allBands: allBands.length ? allBands : [c.title],
        flyerUrl: c.flyerUrl,
        ticketUrl: c.ticketUrl,
        doorsTime: null,
        musicTime: null,
        advancePrice: null,
        dosPrice: null,
        sourceUrl: EVENTS_URL,
      };
    });
}

/** Key for de-duping a Skeletix show against the Dice feed. */
function showKey(s: ScrapedShow): string {
  return `${s.date ?? ""}|${(s.headliner ?? "").toLowerCase()}`;
}

export async function scrapeUndergroundMusic(): Promise<ScrapedShow[]> {
  const pageRes = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(
      `Underground Music Venue events page failed (${pageRes.status} ${pageRes.statusText})`,
    );
  }
  const pageHtml = await pageRes.text();

  const cfg = extractDiceWidgetConfig(pageHtml, "Underground Music Venue");
  const [diceShows, skeletixShows] = await Promise.all([
    fetchDiceShows({
      venue: VENUE,
      apiKey: cfg.apiKey,
      sourceUrl: EVENTS_URL,
      venues: cfg.venues.length ? cfg.venues : [VENUE],
      promoters: cfg.promoters,
    }),
    scrapeSkeletixEmbeds(pageHtml),
  ]);

  // The two sources don't currently overlap, but guard against a show that's
  // listed in both (Dice wins — it carries lineup, doors, and price).
  const diceKeys = new Set(diceShows.map(showKey));
  const extras = skeletixShows.filter((s) => !diceKeys.has(showKey(s)));

  return [...diceShows, ...extras];
}
