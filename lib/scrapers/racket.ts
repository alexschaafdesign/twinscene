// Parser for Racket's weekly "Your Complete Concert Calendar" post — one of
// the Press-tab outlets whose picks star shows elsewhere in our own list
// (see lib/scrapers/starPress.ts). Racket tags every week's calendar post
// "music-listings", so the tag feed's newest item is always the latest
// calendar without needing a hardcoded/guessed URL.
//
// Unlike Crawl Space's clean per-pick Substack markup, Racket's calendar is
// one long WordPress post: a run of plain `<p><a>Artist @ Venue</a></p>`
// listings grouped under `<h2>Weekday, Month Day</h2>` headers (no year), with
// a handful of picks promoted to `<ul><li><span><strong><a>Artist @ Venue</a>
// —</strong>blurb...<strong><em>—Byline</em></strong></span></li></ul>` —
// those are the ones with a critic's writeup. Two things read this same post:
//
//   - scrapeRacket() -> only the featured `<ul>` picks, used by starPress.ts
//     to star shows already on our list.
//   - scrapeRacketComplete() -> every listing, featured or plain — Racket's
//     one is a weekly range rather than Crawl Space's tonight-only, but the
//     same "did we already have this" check applies. No time/age/genre here;
//     Racket's plain listings don't carry them (unlike Crawl Space's Complete
//     Show List) — reconcile.ts only gets a missing-show signal out of it,
//     never a genre/age suggestion.
//
// The `.PostContent_content__FblEJ` wrapper is a CSS-module class name from
// Racket's Next.js build, so it can drift on a Racket redesign — if this
// scraper starts returning nothing, check whether that class changed.

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ScrapedShow } from "./types";

const TAG_FEED_URL = "https://racketmn.com/tag/music-listings/feed";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
export const RACKET_PRESS_ID = "racket";

const CONTENT_SELECTOR = ".PostContent_content__FblEJ";

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

// "Wednesday, July 8" — day-of-week name is unused, just needs to be present.
const DAY_HEADING_RE = /^[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2})/;

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type RacketPost = {
  $: cheerio.CheerioAPI;
  root: cheerio.Cheerio<Element>;
  postUrl: string;
};

/** Fetch the newest calendar post and its parsed body, or null when the feed
 * or the post's content wrapper isn't there. */
async function loadPost(): Promise<RacketPost | null> {
  const feedRes = await fetch(TAG_FEED_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!feedRes.ok) {
    throw new Error(`Racket feed request failed (${feedRes.status})`);
  }
  const feedXml = await feedRes.text();
  const $feed = cheerio.load(feedXml, { xmlMode: true });
  const postUrl = $feed("item").first().children("link").first().text().trim();
  if (!postUrl) return null;

  const pageRes = await fetch(postUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!pageRes.ok) {
    throw new Error(`Racket post request failed (${pageRes.status})`);
  }
  const html = await pageRes.text();
  const $ = cheerio.load(html);
  const root = $(CONTENT_SELECTOR).first();
  if (root.length === 0) return null;
  return { $, root, postUrl };
}

type Listing = { date: string; el: Element };

/** Walk the post body, tracking the current day via its `<h2>` heading.
 * `includePlain` decides whether bare `<p>` listings are collected too — the
 * featured-only star path skips them, the complete-list path wants both. */
function collectListings(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<Element>,
  includePlain: boolean,
): Listing[] {
  const listings: Listing[] = [];
  let currentYear = new Date().getFullYear();
  let currentDate: string | null = null;
  let prevMonthDay: number | null = null;

  root.children().each((_, el) => {
    if (el.tagName === "h2") {
      const m = DAY_HEADING_RE.exec($(el).text().trim());
      if (!m) return;
      const month = MONTHS[m[1].toLowerCase()];
      const day = parseInt(m[2], 10);
      if (month === undefined || Number.isNaN(day)) return;

      // Headings run in chronological order through the week; a date earlier
      // than the previous one means the week crossed into January.
      const monthDay = month * 100 + day;
      if (prevMonthDay !== null && monthDay < prevMonthDay) currentYear++;
      prevMonthDay = monthDay;
      currentDate = formatDate(currentYear, month, day);
      return;
    }

    if (!currentDate) return;

    if (el.tagName === "ul") {
      $(el)
        .find("li")
        .each((_, li) => {
          listings.push({ date: currentDate!, el: li });
        });
    } else if (includePlain && el.tagName === "p") {
      listings.push({ date: currentDate, el });
    }
  });

  return listings;
}

type ParsedListing = {
  allBands: string[];
  venue: string;
  sourceUrl: string;
  blurb: string | null;
};

/** Parse one listing element (a `<p>` or a featured `<li>`) — both are just
 * "Artist, Artist @ Venue" with an optional blurb trailing the link. */
function parseListing($: cheerio.CheerioAPI, el: Element): ParsedListing | null {
  const $el = $(el);
  const $link = $el.find("a").first();
  if ($link.length === 0) return null;

  const titleText = $link.text().trim(); // "Artist, Artist @ Venue"
  const sourceUrl = $link.attr("href") || "";
  const atIdx = titleText.lastIndexOf(" @ ");
  if (atIdx === -1) return null;

  const billing = titleText.slice(0, atIdx).trim();
  const venue = titleText.slice(atIdx + 3).trim();
  if (!billing || !venue) return null;

  // Racket separates co-bills with "," or "+" and sometimes appends a
  // parenthetical note like "(Album Release)" to one act's name.
  const allBands = billing
    .replace(/\([^)]*\)/g, "")
    .split(/,|\+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allBands.length === 0) return null;

  // Blurb is everything after the linked title, minus the leading "—"
  // separator and the trailing "—Byline" every featured pick ends with
  // (bylines are short, so a second em dash within ~80 chars of the end
  // reliably marks where it starts). A plain listing has no text besides its
  // link, so this comes back empty -> null there.
  const $blurb = $el.clone();
  $blurb.find("a").first().remove();
  const blurb =
    $blurb
      .text()
      .trim()
      .replace(/^—\s*/, "")
      .replace(/—[^—]{1,80}$/, "")
      .trim() || null;

  return { allBands, venue, sourceUrl, blurb };
}

/** The featured picks only, for starPress.ts to star against our own list. */
export async function scrapeRacket(): Promise<ScrapedShow[]> {
  const post = await loadPost();
  if (!post) return [];
  const { $, root, postUrl } = post;

  const shows: ScrapedShow[] = [];
  for (const { date, el } of collectListings($, root, false)) {
    const parsed = parseListing($, el);
    if (!parsed) continue;
    shows.push({
      venue: parsed.venue,
      date,
      headliner: parsed.allBands[0],
      supporting: parsed.allBands.slice(1),
      allBands: parsed.allBands,
      flyerUrl: null,
      ticketUrl: parsed.sourceUrl || null,
      doorsTime: null,
      musicTime: null,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: parsed.sourceUrl || postUrl,
      press: RACKET_PRESS_ID,
      blurb: parsed.blurb,
      pressPostUrl: postUrl,
    });
  }
  return shows;
}

/** This week's full calendar — every listing, featured or plain. Feeds
 * reconcile.ts; these are NOT imported as new shows. */
export async function scrapeRacketComplete(): Promise<ScrapedShow[]> {
  const post = await loadPost();
  if (!post) return [];
  const { $, root, postUrl } = post;

  const shows: ScrapedShow[] = [];
  for (const { date, el } of collectListings($, root, true)) {
    const parsed = parseListing($, el);
    if (!parsed) continue;
    shows.push({
      venue: parsed.venue,
      date,
      headliner: parsed.allBands[0],
      supporting: parsed.allBands.slice(1),
      allBands: parsed.allBands,
      flyerUrl: null,
      ticketUrl: parsed.sourceUrl || null,
      doorsTime: null,
      musicTime: null,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: parsed.sourceUrl || postUrl,
      press: RACKET_PRESS_ID,
      pressPostUrl: postUrl,
    });
  }
  return shows;
}
