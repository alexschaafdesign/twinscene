// Parser for Crawl Space MSP's daily "Complete Twin Cities Concert List"
// Substack post — one of the Press-tab outlets whose picks star shows
// elsewhere in our own list rather than get imported as new ones (see
// lib/scrapers/starPress.ts). Only the "My picks for top shows tonight"
// section is parsed; the much longer full genre-sectioned list below it is
// left alone.
//
// The feed's <content:encoded> is real HTML: each pick is
// `<li><p><a href="venue event url">Venue</a> - (optional context) Band,
// Band [7:00p] [All Ages] <em>Genre / Genre</em></p></li>`, with a featured
// pick additionally nesting `<ul><li><p><strong>blurb</strong></p></li></ul>`
// inside its <li>. Parsed with cheerio in xmlMode for the feed XML itself
// (so the namespaced <content:encoded> tag survives), then re-parsed as HTML
// for the post body.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

const FEED_URL = "https://crawlspacemsp.substack.com/feed";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
export const CRAWLSPACE_PRESS_ID = "crawlspace";

/** Today's date as "YYYY-MM-DD" in America/Chicago. Kept in sync with the
 * same helper in lib/fetchShows.ts — the post is always about tonight. */
function todayInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "7:00p" / "7:00 pm" -> "7:00p"; anything else -> null. */
function parseTimeTag(bracket: string): string | null {
  return /^\d{1,2}:\d{2}\s*[ap]m?$/i.test(bracket)
    ? bracket.replace(/\s+/g, "").toLowerCase()
    : null;
}

export async function scrapeCrawlSpace(): Promise<ScrapedShow[]> {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Crawl Space feed request failed (${res.status})`);
  }
  const xml = await res.text();
  const $feed = cheerio.load(xml, { xmlMode: true });
  const item = $feed("item").first();
  const postUrl = item.children("link").first().text().trim() || FEED_URL;
  const contentEncoded = item.find("content\\:encoded").first().text();
  if (!contentEncoded) return [];

  const $ = cheerio.load(contentEncoded);
  const heading = $("h3")
    .filter((_, el) => /top shows/i.test($(el).text()))
    .first();
  const list = heading.nextAll("ul").first();
  if (list.length === 0) return [];

  const date = todayInChicago();
  const shows: ScrapedShow[] = [];

  list.children("li").each((_, li) => {
    const $li = $(li);
    const $p = $li.children("p").first();
    const $venueLink = $p.find("a").first();
    const venue = $venueLink.text().trim();
    if (!venue) return;
    const sourceUrl = $venueLink.attr("href") || "";

    // Genre tags live in <em>; strip them before reading the line so they
    // don't end up glued onto the last band name.
    const $info = $p.clone();
    $info.find("em").remove();
    let info = $info.text().trim();
    if (info.startsWith(venue)) info = info.slice(venue.length).trim();
    info = info.replace(/^-\s*/, "");

    const brackets = [...info.matchAll(/\[([^\]]+)\]/g)].map((m) =>
      m[1].trim(),
    );
    info = info
      .replace(/\[[^\]]+\]/g, "")
      .replace(/^\([^)]*\)\s*/, "") // drop a leading "(Album Release Show)"-style note
      .trim();

    const allBands = info
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allBands.length === 0) return;

    const musicTime =
      brackets.map(parseTimeTag).find((t): t is string => t !== null) ??
      null;

    const blurb =
      $li.children("ul").first().find("p").first().text().trim() || null;

    shows.push({
      venue,
      date,
      headliner: allBands[0],
      supporting: allBands.slice(1),
      allBands,
      flyerUrl: null,
      ticketUrl: sourceUrl || null,
      doorsTime: null,
      musicTime,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: sourceUrl || FEED_URL,
      press: CRAWLSPACE_PRESS_ID,
      blurb,
      pressPostUrl: postUrl,
    });
  });

  return shows;
}
