// Scraper for First Avenue's shows calendar.
//
// First Avenue books a whole family of Twin Cities rooms — First Avenue itself,
// 7th St Entry, the Turf Club, Fine Line, Palace Theatre, the Fitzgerald, the
// Depot Tavern, plus co-presented shows at other venues — and lists them all on
// one WordPress calendar at https://first-avenue.com/shows/. So this single
// scraper yields shows across many venues; each ScrapedShow carries its own
// `venue` (read off the card's venue label), which is what downstream import
// keys on.
//
// The calendar is server-rendered and paginated one month at a time via a
// `?start_date=YYYYMM01` query param. We fetch the current month plus the next
// few and parse each card (`.show_list_item`). Cards carry the date via a
// preceding `#day-YYYY-MM-DD` anchor, so we walk day anchors and cards together
// in document order and stamp each card with the most recent date seen.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

const SHOWS_URL = "https://first-avenue.com/shows/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// How many months past the current one to fetch. The rooms book well ahead, so
// a few months of lead time keeps the review queue useful without hammering the
// site (one request per month).
const MONTHS_AHEAD = 3;

// Empty divs like <div id="day-2026-07-1"></div> precede each day's cards and
// are the only place the full year appears (the card itself shows just
// "Jul 1"). Day-of-month is not zero-padded.
const DAY_ID_RE = /^day-(\d{4})-(\d{2})-(\d{1,2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Decode stray non-breaking spaces and collapse whitespace. */
function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Split a "with A, B and C" supporting-acts string into band names. */
function parseSupporting(text: string): string[] {
  return clean(text)
    .replace(/^with\s+/i, "")
    .split(/,\s*and\s+|\s+and\s+|,\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !/^tba$/i.test(s));
}

/** Pull the flyer image out of a `.photo` element's inline background-image. */
function posterUrl(style: string | undefined): string | null {
  if (!style) return null;
  const m = style.match(/url\(\s*['"]?([^'")]+)/);
  return m ? m[1].trim() : null;
}

/** The month-start URLs to fetch: current month plus MONTHS_AHEAD following. */
function monthPageUrls(): string[] {
  const now = new Date();
  const urls: string[] = [];
  for (let i = 0; i <= MONTHS_AHEAD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}01`;
    urls.push(`${SHOWS_URL}?post_type=event&start_date=${start}`);
  }
  return urls;
}

/** Parse every `.show_list_item` on one month page into ScrapedShow[]. */
function parsePage(html: string): ScrapedShow[] {
  const $ = cheerio.load(html);
  const shows: ScrapedShow[] = [];

  // Walk day anchors and cards together so each card inherits the date from the
  // nearest preceding #day- anchor.
  let currentDate: string | null = null;

  $(".shows")
    .find('[id^="day-"], .show_list_item')
    .each((_, el) => {
      const $el = $(el);

      const id = $el.attr("id") || "";
      const dayMatch = DAY_ID_RE.exec(id);
      if (dayMatch) {
        currentDate = `${dayMatch[1]}-${dayMatch[2]}-${pad(Number(dayMatch[3]))}`;
        return;
      }

      // Otherwise it's a .show_list_item. The card renders each field twice
      // (mobile + desktop variants), so take the first of each.
      const venue = clean($el.find(".venue_name").first().text());
      const headliner = clean($el.find(".show_name h4").first().text());
      const supportText = $el.find(".show_name h5").first().text();
      const supporting = supportText ? parseSupporting(supportText) : [];

      const eventHref =
        $el.find('a[href*="/event/"]').first().attr("href") || null;
      // A card may carry a direct "Buy Tickets" link (AXS, etix, …); prefer it
      // over the on-site event page.
      const buyHref =
        $el
          .find("a")
          .filter((_, a) => clean($(a).text()).toLowerCase() === "buy tickets")
          .first()
          .attr("href") || null;

      const flyerUrl = posterUrl(
        $el.find(".gig_poster_col .photo").first().attr("style"),
      );

      const allBands = [headliner, ...supporting].filter(
        (b): b is string => !!b,
      );

      shows.push({
        venue: venue || "First Avenue",
        date: currentDate,
        headliner: headliner || null,
        supporting,
        allBands,
        flyerUrl,
        ticketUrl: buyHref || eventHref,
        doorsTime: null,
        musicTime: null,
        advancePrice: null,
        dosPrice: null,
        sourceUrl: eventHref || SHOWS_URL,
      });
    });

  return shows;
}

export async function scrapeFirstAvenue(): Promise<ScrapedShow[]> {
  const pages = await Promise.all(
    monthPageUrls().map(async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(
          `First Avenue request failed (${res.status} ${res.statusText}) for ${url}`,
        );
      }
      return parsePage(await res.text());
    }),
  );

  return pages.flat();
}
