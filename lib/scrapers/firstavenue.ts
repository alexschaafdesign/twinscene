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
//
// Doors/show times are NOT on the calendar cards — they live only on each
// event's own page, in a `.show_details` block of <h6>label</h6><h2>value</h2>
// pairs ("Doors Open" → "7PM", "Show Starts" → "6:30PM"). So after parsing the
// month calendars we fetch each event page once (bounded concurrency) and read
// the times off it. A detail fetch failing is best-effort: the show still
// imports, just without times, rather than failing the whole run.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const SHOWS_URL = "https://first-avenue.com/shows/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// First Avenue is also a *promoter*: its calendar lists shows it presents at
// rooms it doesn't run, which another scraper already owns from that venue's
// own site. Skipping them here avoids importing the same show twice (the
// cross-source dedup in runAll only *flags* such pairs, it doesn't drop them).
// Match is on the exact card venue label as First Avenue writes it (confirmed
// against the .venue_name text) — which is NOT always the canonical venue name
// the owning scraper emits, so keep these strings verbatim from this site:
//   - "The Cedar Cultural Center" — owned by cedar.ts (same string).
//   - "icehouse MPLS" — owned by icehouse.ts, which emits venue "Icehouse".
const VENUES_OWNED_ELSEWHERE = new Set(
  ["The Cedar Cultural Center", "icehouse MPLS"].map((v) => v.toLowerCase()),
);

function isOwnedElsewhere(venue: string): boolean {
  return VENUES_OWNED_ELSEWHERE.has(clean(venue).toLowerCase());
}

// How many months past the current one to fetch. The rooms book well ahead, so
// a few months of lead time keeps the review queue useful without hammering the
// site (one request per month).
const MONTHS_AHEAD = 3;

// Each show's times need one more request (its event page). Cap how many of
// those are in flight at once so we don't hammer the site with a few hundred
// simultaneous fetches.
const DETAIL_CONCURRENCY = 6;

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
  // Protect known comma-containing act names ("Earth, Wind & Fire") before
  // splitting, so the split below can't fragment them.
  const { text: protectedText, restore } = protectKnownNames(clean(text));
  return protectedText
    .replace(/^with\s+/i, "")
    .split(/,\s*and\s+|\s+and\s+|,\s*/)
    .map((s) => restore(s).trim())
    .filter((s) => s && !/^tba$/i.test(s));
}

// First Avenue books non-music events (private rentals, rallies, etc.) into
// the same calendar as shows, with no separate category to key off — unlike
// hookandladder.ts's structured event data, here the headliner text is all
// there is, so this is a best-effort keyword match. Unmatched headliners are
// left as ordinary shows (conservative default): a false negative just means
// a non-music listing gets treated as a show; a false positive would (wrongly)
// strip a real band's members, which is worse, so this never falls back to a
// generic label the way hookandladder.ts's classifyEventType does.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/private event/i, "Private Event"],
  [/\brally\b/i, "Rally"],
  [/record (sale|fair|show|swap)|vinyl (sale|fair)/i, "Record Sale"],
  [/\bmeet-?up\b/i, "Meetup"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
];

function classifyEventType(headliner: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(headliner)) return label;
  }
  return null;
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

      // A room another scraper owns from its own site — skip First Avenue's
      // "presented at …" copy of it so the show isn't imported from two
      // sources (see VENUES_OWNED_ELSEWHERE).
      if (isOwnedElsewhere(venue)) return;

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

      // A non-music listing (private rental, rally, …): keep the card so it
      // still shows up with its title and a tag chip, but don't feed its
      // "lineup" — attendee names, a room-rental label, etc. — through as
      // band members.
      const tag = headliner ? classifyEventType(headliner) : null;
      const allBands = tag
        ? []
        : [headliner, ...supporting].filter((b): b is string => !!b);

      shows.push({
        venue: venue || "First Avenue",
        date: currentDate,
        headliner: headliner || null,
        supporting: tag ? [] : supporting,
        allBands,
        flyerUrl,
        ticketUrl: buyHref || eventHref,
        doorsTime: null,
        musicTime: null,
        advancePrice: null,
        dosPrice: null,
        sourceUrl: eventHref || SHOWS_URL,
        tag,
      });
    });

  return shows;
}

/**
 * Normalize First Avenue's time strings ("7PM", "6:30PM") to the "7:00pm" /
 * "6:30pm" style the other scrapers emit. Returns null for anything unparseable
 * or empty.
 */
function formatTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(raw);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ?? "00";
  return `${hour}:${minute}${m[3].toLowerCase()}m`;
}

/**
 * Pull doors/show times off an event page's `.show_details` block, which lists
 * <h6>label</h6><h2>value</h2> pairs ("Doors Open", "Show Starts", "Ages").
 */
function parseEventTimes(html: string): {
  doorsTime: string | null;
  musicTime: string | null;
} {
  const $ = cheerio.load(html);
  let doorsTime: string | null = null;
  let musicTime: string | null = null;

  $(".show_details h6").each((_, el) => {
    const label = clean($(el).text()).toLowerCase();
    const value = clean($(el).next("h2").text());
    if (label.includes("doors")) doorsTime = formatTime(value);
    else if (label.includes("show")) musicTime = formatTime(value);
  });

  return { doorsTime, musicTime };
}

/** Fetch one event page's times; best-effort — never throws. */
async function fetchEventTimes(
  url: string,
): Promise<{ doorsTime: string | null; musicTime: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return { doorsTime: null, musicTime: null };
    return parseEventTimes(await res.text());
  } catch {
    return { doorsTime: null, musicTime: null };
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
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

  const shows = pages.flat();

  // Fill in doors/show times from each show's event page (see file header).
  // Only cards that link to an on-site event page can be enriched; sourceUrl
  // falls back to the calendar URL for the rest, which we skip.
  await mapWithConcurrency(shows, DETAIL_CONCURRENCY, async (show) => {
    if (!show.sourceUrl.includes("/event/")) return;
    const { doorsTime, musicTime } = await fetchEventTimes(show.sourceUrl);
    show.doorsTime = doorsTime;
    show.musicTime = musicTime;
  });

  return shows;
}
