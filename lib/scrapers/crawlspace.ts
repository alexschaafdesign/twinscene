// Parser for Crawl Space MSP's daily "Complete Twin Cities Concert List"
// Substack post. Crawl Space is a reference/annotation source, not a venue to
// import from — the same post feeds two jobs:
//
//   - scrapeCrawlSpace() -> the "Recommended upcoming shows" section (the
//     curator's picks for the days ahead), used by starPress.ts to star shows
//     already on our list.
//   - scrapeCrawlSpaceComplete() -> the "Complete Show List" section (every
//     show TONIGHT, each tagged with a start time, an age restriction, and a
//     genre), used by reconcile.ts to (a) suggest genre/age onto shows we
//     already have and (b) surface ones we're missing.
//
// The feed's <content:encoded> is real HTML. The complete-list items look like
//   `<li><p><span>Venue - (optional context) Band, Band [7:00p] [21+] </span>
//    <em><span>Folk / Singer-Songwriter</span></em></p></li>`
// (genre in the <em>, time/age in [brackets]); the recommended items look like
//   `<li><p>7/21 - <a href="…">Venue</a> - Band, Band</p></li>`
// (a bare M/D date, venue as a link, no genre). Parsed with cheerio in xmlMode
// for the feed XML (so the namespaced <content:encoded> tag survives), then
// re-parsed as HTML for the post body.
//
// Section headings drift ("Complete Show List" today was "top shows tonight"
// before), so both parsers locate their <ul> by a forgiving heading regex and
// simply yield nothing if the section is absent — a format change degrades to
// empty, it doesn't throw.

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ScrapedShow } from "./types";
import { normalizeGenres, normalizeAge } from "@/lib/showGenres";

const FEED_URL = "https://crawlspacemsp.substack.com/feed";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
export const CRAWLSPACE_PRESS_ID = "crawlspace";

/** Today's date as "YYYY-MM-DD" in America/Chicago. Kept in sync with the
 * same helper in lib/fetchShows.ts — the "Complete Show List" is always tonight. */
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

type CrawlPost = {
  $: cheerio.CheerioAPI;
  postUrl: string;
};

/** Fetch the newest post and return its parsed body + canonical URL, or null
 * when the feed has no usable content. */
async function loadPost(): Promise<CrawlPost | null> {
  const res = await fetch(FEED_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Crawl Space feed request failed (${res.status})`);
  }
  const xml = await res.text();
  const $feed = cheerio.load(xml, { xmlMode: true });
  const item = $feed("item").first();
  const postUrl = item.children("link").first().text().trim() || FEED_URL;
  const contentEncoded = item.find("content\\:encoded").first().text();
  if (!contentEncoded) return null;
  return { $: cheerio.load(contentEncoded), postUrl };
}

/** The <ul> immediately after the first <h_> heading matching `re`, or an empty
 * selection when that section isn't present. Skips any heading that also reads
 * as a "picks" intro (e.g. "crawlspace picks for top shows tonight…") — that
 * section's wording overlaps our forgiving `re` patterns but isn't either
 * target section, so a bare `re.test` would lock onto its (single-item) list. */
function sectionList($: cheerio.CheerioAPI, re: RegExp) {
  const heading = $("h1,h2,h3,h4,h5,h6")
    .filter((_, el) => {
      const text = $(el).text();
      return re.test(text) && !/picks/i.test(text);
    })
    .first();
  return heading.nextAll("ul").first();
}

/** Parse one "Complete Show List" <li> into its parts. Genre lives in the
 * trailing <em>; the rest of the line is "Venue - (context) Bands [time] [age]". */
export type CrawlEntry = {
  venue: string;
  headliner: string | null;
  allBands: string[];
  musicTime: string | null;
  ageRestriction: string | null;
  genres: string[];
  sourceUrl: string;
};

function parseCompleteEntry(
  $: cheerio.CheerioAPI,
  li: Element,
): CrawlEntry | null {
  const $li = $(li);
  const $p = $li.children("p").first();
  if ($p.length === 0) return null;

  // Genre tags live in <em>; read then strip them so they don't glue onto the
  // last band name when we read the rest of the line.
  const genres = normalizeGenres($p.find("em").text());
  const $info = $p.clone();
  $info.find("em").remove();
  let info = $info.text().replace(/\s+/g, " ").trim();

  // "Venue - rest": the venue is a plain text prefix here (no link), split on
  // the first " - ". Bail if there's no separator (not a show line).
  const dash = info.indexOf(" - ");
  if (dash === -1) return null;
  const venue = info.slice(0, dash).trim();
  info = info.slice(dash + 3).trim();
  if (!venue) return null;

  // A pick may carry a Substack link on the venue; fall back to the post.
  const sourceUrl = $p.find("a").first().attr("href") || "";

  // Pull [bracketed] tags: one is the start time, another the age restriction.
  const brackets = [...info.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  const musicTime =
    brackets.map(parseTimeTag).find((t): t is string => t !== null) ?? null;
  const ageRestriction =
    brackets
      .filter((b) => parseTimeTag(b) === null)
      .map(normalizeAge)
      .find((a): a is string => a !== null) ?? null;

  info = info
    .replace(/\[[^\]]+\]/g, "") // drop the bracket tags
    .replace(/^\([^)]*\)\s*/, "") // drop a leading "(Womenfolk Presents)" note
    .trim();

  const allBands = info
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allBands.length === 0) return null;

  return {
    venue,
    headliner: allBands[0],
    allBands,
    musicTime,
    ageRestriction,
    genres,
    sourceUrl,
  };
}

/** Tonight's full list, each entry tagged with genre + age. Feeds reconcile.ts;
 * these are NOT imported as new shows. */
export async function scrapeCrawlSpaceComplete(): Promise<ScrapedShow[]> {
  const post = await loadPost();
  if (!post) return [];
  const { $, postUrl } = post;

  const list = sectionList($, /complete show list|top shows/i);
  if (list.length === 0) return [];

  const date = todayInChicago();
  const shows: ScrapedShow[] = [];
  list.children("li").each((_, li) => {
    const entry = parseCompleteEntry($, li);
    if (!entry) return;
    shows.push({
      venue: entry.venue,
      date,
      headliner: entry.headliner,
      supporting: entry.allBands.slice(1),
      allBands: entry.allBands,
      flyerUrl: null,
      ticketUrl: entry.sourceUrl || null,
      doorsTime: null,
      musicTime: entry.musicTime,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: entry.sourceUrl || postUrl,
      genres: entry.genres,
      ageRestriction: entry.ageRestriction,
      press: CRAWLSPACE_PRESS_ID,
      pressPostUrl: postUrl,
    });
  });
  return shows;
}

/** Resolve a bare "M/D" (no year) to "YYYY-MM-DD", choosing the year that puts
 * it today-or-later — the post only lists upcoming dates, so a "1/3" in
 * December means next January. */
function resolveMonthDay(md: string, today: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(md.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  // This year if it's not already well in the past, otherwise it wrapped to next.
  return candidate >= todayMinusGrace(today)
    ? candidate
    : `${year + 1}-${pad(month)}-${pad(day)}`;
}

/** Today minus a few days of grace, so a just-passed date still resolves to
 * this year rather than jumping a year ahead on an off-by-one. */
function todayMinusGrace(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}

/** The curator's "Recommended upcoming shows" picks, for starPress.ts to star
 * against our own list. No genre/age here (that's the complete-list job). */
export async function scrapeCrawlSpace(): Promise<ScrapedShow[]> {
  const post = await loadPost();
  if (!post) return [];
  const { $, postUrl } = post;

  const list = sectionList($, /recommended upcoming|upcoming shows|top shows/i);
  if (list.length === 0) return [];

  const today = todayInChicago();
  const shows: ScrapedShow[] = [];
  list.children("li").each((_, li) => {
    const $p = $(li).children("p").first();
    const text = $p.text().replace(/\s+/g, " ").trim();
    // "M/D - Venue - Band, Band"
    const m = /^(\d{1,2}\/\d{1,2})\s*-\s*(.+)$/.exec(text);
    if (!m) return;
    const date = resolveMonthDay(m[1], today);
    if (!date) return;

    const rest = m[2];
    const dash = rest.indexOf(" - ");
    if (dash === -1) return;
    const venue = rest.slice(0, dash).trim();
    const bands = rest
      .slice(dash + 3)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!venue || bands.length === 0) return;

    shows.push({
      venue,
      date,
      headliner: bands[0],
      supporting: bands.slice(1),
      allBands: bands,
      flyerUrl: null,
      ticketUrl: $p.find("a").first().attr("href") || null,
      doorsTime: null,
      musicTime: null,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: $p.find("a").first().attr("href") || postUrl,
      press: CRAWLSPACE_PRESS_ID,
      pressPostUrl: postUrl,
    });
  });
  return shows;
}
