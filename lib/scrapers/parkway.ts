// Scraper for The Parkway Theater's events calendar.
//
// theparkwaytheater.com is Squarespace, so — like cedar.ts and berlin.ts — the
// event list is available as JSON without HTML parsing. The public `/live-events`
// page is only a summary block; the real events collection lives at
// `/all-events`, whose `?format=json` returns an `upcoming[]` array. Each entry's
// `startDate` is the show's *music* start time (confirmed against the "X pm
// Music" line in the body), not doors — doors is parsed out of the body text
// alongside pricing, same shape as cedar.ts.
//
// The Parkway is a mixed-use theater: it runs film screenings, comedy, and the
// occasional storytelling/podcast night alongside its concerts. Per the venue's
// own Squarespace `categories` taxonomy:
//   - "Movies" → dropped outright. The user doesn't want film screenings in the
//     feed, and this category cleanly tags all of them (repertory films, cult
//     screenings, film festivals, even movie-plus-live-guest events like "The
//     Room ... with Greg Sestero Live!").
//   - "Comedy" → kept but labeled with an event-type `tag` ("Comedy"), so it
//     lands under the "Show all events" toggle rather than the default concerts
//     view (mirrors how cedar.ts/acadia.ts tag their non-band fixtures). A
//     couple of recognizable non-music formats (The Moth's StorySLAM, trivia,
//     burlesque, drag, etc.) are caught by title as well, since the venue files
//     them under generic "Live Events" with no distinguishing category.
//   - everything else → an ordinary music show (untagged, shown by default).
//
// Titles carry the usual venue decoration: status prefixes ("SOLD OUT:", "LOW
// TICKET ALERT:", "SECOND NIGHT ADDED:", "LATE SHOW ADDED:") and a "// Tour
// Name" subtitle after the headliner. Those are stripped so (a) the artist name
// underneath can fuzzy-match the directory and (b) the source_key stays stable
// as the venue flips a show from "LOW TICKET ALERT" to "SOLD OUT" between
// scrapes. Band splitting mirrors cedar.ts.
//
// The body embeds several outbound links (the presenter, the artist's socials);
// the real per-show ticket link is the dice.fm "BUY TICKETS" anchor, identified
// by its anchor text rather than by domain, same approach as cedar.ts.

import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "The Parkway Theater";
// The public page is /live-events (a summary block); the backing events
// collection — the one with a JSON feed — is /all-events.
const EVENTS_URL = "https://theparkwaytheater.com/all-events";
const PUBLIC_URL = "https://theparkwaytheater.com/live-events";
const JSON_URL = `${EVENTS_URL}?format=json`;
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const TIMEZONE = "America/Chicago";

// Recognizable non-music formats the venue files under generic "Live Events"
// with no distinguishing category, so they can't be caught by `categories`
// alone. Kept (labeled) rather than dropped, like the venue's Comedy events.
// Deliberately narrow — only unambiguous non-band formats — so real booked
// shows never get mislabeled and hidden from the default concerts view.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\bstoryslam\b|\bthe moth\b/i, "Storytelling"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
  [/\bburlesque\b/i, "Burlesque"],
  [/\bdrag\b/i, "Drag"],
  [/\bkaraoke\b/i, "Karaoke"],
  [/\bopen mic\b/i, "Open Mic"],
];

function classifyByTitle(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

// Status markers and presenter phrases the venue prepends to a title; stripped
// so the headliner underneath matches the directory and the source_key doesn't
// churn when the marker changes between scrapes (e.g. "LOW TICKET ALERT" ->
// "SOLD OUT"). "An Evening with X" is a presentation phrase, not a second act —
// without stripping it, the " with " band-split would strand "An Evening" as
// the headliner.
const STATUS_PREFIXES: RegExp[] = [
  /^sold out[:!]\s*/i,
  /^low ticket alert:\s*/i,
  /^second night added:\s*/i,
  /^late show added:\s*/i,
  /^just announced:\s*/i,
  /^an (?:intimate )?evening with\s+/i,
];

type ParkwayEvent = {
  title: string;
  fullUrl: string;
  assetUrl?: string;
  body?: string;
  startDate: number;
  categories?: string[];
};

type EventsJson = {
  upcoming: ParkwayEvent[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;/g, "’");
}

/** Strip a leading status marker ("SOLD OUT:", "LOW TICKET ALERT:", …). */
function stripStatusPrefix(title: string): string {
  for (const re of STATUS_PREFIXES) {
    if (re.test(title)) return title.replace(re, "").trim();
  }
  return title;
}

/** Drop the trailing subtitle that follows the headliner: a "// Tour Name"
 * segment ("The Watson Twins // Seeing Double Tour" -> "The Watson Twins") or a
 * spaced-dash set/album name ("Scottie Miller: Hello Pain – Album Release with
 * Orchestra" -> "Scottie Miller: Hello Pain"), so a subtitle that happens to
 * contain "with"/"and" can't be misread as a support act by splitBands. */
function stripSubtitle(title: string): string {
  return title
    .split(/\s*\/\/\s*/)[0]
    .split(/\s+[–—-]\s+/)[0]
    .trim();
}

/** Split a (already cleaned) title into individual act names. Mirrors
 * cedar.ts: protect known comma-containing names, treat "with" as the
 * headliner/support boundary, then split on the usual delimiters. */
function splitBands(cleanTitle: string): string[] {
  const { text: protectedTitle, restore } = protectKnownNames(cleanTitle);
  const sides = protectedTitle.split(/\s+with\s+special\s+guests?\s+|\s+with\s+/i);
  const names = sides.flatMap((side) =>
    side.split(
      /\s*,\s*&\s+|\s*,\s*and\s+|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i,
    ),
  );
  return names
    .map(restore)
    .map((n) => n.trim().replace(/^special guests?\s+/i, "").trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** Plain text of the Squarespace body HTML. Tags are replaced with a space
 * (not stripped) because the header's date and time sit in separate elements
 * with no whitespace text node between them — cheerio's `.text()` would glue
 * "…2026" and "7 pm" into "20267 pm" and corrupt the doors hour. <style>/<script>
 * blocks (Squarespace injects per-block CSS) are dropped first so their contents
 * don't leak into the text. */
function extractText(body: string): string {
  return decodeEntities(
    body
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const ANCHOR_RE = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
// Ticketing hosts The Parkway routes through (dice.fm is the current one). A
// sold-out show keeps its dice link but relabels the button "SOLD OUT", so the
// domain match below catches it when the anchor-text match wouldn't.
const TICKET_HOSTS =
  /dice\.fm|eventbrite\.|seetickets\.|\baxs\.com|etix\.com|ticketweb\.|showclix\./i;

/** The per-show ticket link. Preferred by anchor text ("Buy Tickets"), since
 * the body also links the presenter and the artist's socials; falls back to any
 * known ticketing host so sold-out shows (button relabeled "SOLD OUT") still
 * resolve. */
function extractTicketUrl(body: string): string | null {
  let hostFallback: string | null = null;
  for (const m of body.matchAll(ANCHOR_RE)) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ").trim();
    if (!href || /^mailto:/i.test(href)) continue;
    if (/buy tickets|get tickets|\btickets\b|\brsvp\b/i.test(text)) return href;
    if (!hostFallback && TICKET_HOSTS.test(href)) hostFallback = href;
  }
  return hostFallback;
}

const DOORS_RE = /(\d{1,2}(?::\d{2})?)\s*([ap])\.?m\.?\s*doors/i;

/** "6:30 pm" / "7 pm" -> "6:30pm" / "7:00pm" (matching the other scrapers). */
function formatBodyTime(hourMin: string, ap: string): string {
  const [h, m] = hourMin.split(":");
  return `${parseInt(h, 10)}:${m ?? "00"}${ap.toLowerCase()}m`;
}

function parseDoorsTime(text: string): string | null {
  const m = DOORS_RE.exec(text);
  return m ? formatBodyTime(m[1], m[2]) : null;
}

/** Pricing lines read "$NN (fee-inclusive) <Tier Name>" — the amount precedes
 * its label. General Admission is the tier we track; a stray space inside the
 * decimal ("$37. 50") is a real data-entry artifact in the source, so the
 * amount pattern tolerates it. */
function priceBefore(text: string, label: RegExp): number | null {
  const re = new RegExp(
    `\\$\\s?(\\d+(?:\\s?\\.\\s?\\d+)?)\\s*\\([^)]*\\)\\s*${label.source}`,
    "i",
  );
  const m = re.exec(text);
  return m ? parseFloat(m[1].replace(/\s+/g, "")) : null;
}

function parsePricing(text: string): {
  advancePrice: number | null;
  dosPrice: number | null;
} {
  const advance =
    priceBefore(text, /advance general admission/) ??
    priceBefore(text, /general admission/);
  const dos = priceBefore(text, /at the door general admission/);
  if (advance === null && dos === null && /\bfree\b/i.test(text)) {
    return { advancePrice: null, dosPrice: null };
  }
  // Fallback: no GA tier named (e.g. VIP-only bills) — take the first amount.
  if (advance === null) {
    const flat = text.match(/\$\s?(\d+(?:\.\d+)?)/);
    return {
      advancePrice: flat ? parseFloat(flat[1]) : null,
      dosPrice: dos,
    };
  }
  return { advancePrice: advance, dosPrice: dos };
}

/** Epoch ms -> "YYYY-MM-DD" and "8:00pm", both in the venue's local timezone. */
function localDateAndTime(ms: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;

  let hour = parseInt(get("hour"), 10) % 24;
  const minute = get("minute");
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return { date, time: `${hour}:${minute}${suffix}` };
}

function parseEvent(event: ParkwayEvent): ScrapedShow | null {
  const categories = event.categories ?? [];
  // Film screenings aren't wanted in the feed at all.
  if (categories.some((c) => /^movies$/i.test(c))) return null;

  const rawTitle = decodeEntities(event.title).replace(/\s+/g, " ").trim();
  const cleanTitle = stripSubtitle(stripStatusPrefix(rawTitle));

  // Comedy is the venue's own category; a few other non-music formats are only
  // recognizable by title.
  const tag = categories.some((c) => /^comedy$/i.test(c))
    ? "Comedy"
    : classifyByTitle(rawTitle);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  if (tag) {
    // A non-band fixture: keep the cleaned title as the display name rather
    // than splitting it into "acts" (comedians aren't directory bands), so it
    // queues for review instead of looking auto-importable. Mirrors cedar.ts.
    headliner = cleanTitle;
    supporting = [];
    allBands = [];
  } else {
    allBands = splitBands(cleanTitle);
    if (allBands.length === 0) return null;
    [headliner, ...supporting] = allBands;
  }

  const body = event.body || "";
  const text = extractText(body);
  const { date, time: musicTime } = localDateAndTime(event.startDate);
  const { advancePrice, dosPrice } = parsePricing(text);

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: event.assetUrl || null,
    ticketUrl: extractTicketUrl(body),
    doorsTime: parseDoorsTime(text),
    musicTime,
    advancePrice,
    dosPrice,
    sourceUrl: event.fullUrl
      ? `https://theparkwaytheater.com${event.fullUrl}`
      : PUBLIC_URL,
    tag,
  };
}

export async function scrapeParkway(): Promise<ScrapedShow[]> {
  const res = await fetch(JSON_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `The Parkway Theater request failed (${res.status} ${res.statusText})`,
    );
  }
  const data: EventsJson = await res.json();
  return (data.upcoming ?? [])
    .map(parseEvent)
    .filter((s): s is ScrapedShow => s !== null);
}
