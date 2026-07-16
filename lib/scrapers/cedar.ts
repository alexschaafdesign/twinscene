// Scraper for The Cedar Cultural Center's events calendar.
//
// Like berlin.ts's venue, this is Squarespace, so the full "upcoming" list is
// available as JSON at `?format=json` — no HTML parsing needed for the event
// list itself. Unlike Berlin, `startDate`/`endDate` line up with the show's
// *start* time exactly (confirmed against the "Show: H:MMam/pm" line in the
// body), not doors — doors time isn't in the JSON at all, so it's parsed out
// of the body text alongside pricing.
//
// Event titles carry a lot of one-off decoration: status markers ("❗SOLD
// OUT❗"), a recurring "☀️Summer at The Cedar : ARTIST☀️" series, and several
// "X presents ARTIST" cross-promotions (First Avenue, Latin Dance MN,
// TaikoArts Midwest, The Cedar's own "Global Get Together" night). Those are
// stripped as known prefixes so the artist name underneath can fuzzy-match
// the directory, same approach as berlin.ts's SERIES_PREFIXES. Genuinely
// non-band listings (private rentals, volunteer orientation, a film
// screening) are kept and labeled with an event-type tag rather than
// dropped, mirroring hookandladder.ts/acadia.ts.
//
// The body HTML embeds an Eventbrite checkout widget for most shows, but also
// a couple of generic `thecedar.org/ticket-info` and `/access` links that
// aren't per-show — the real ticket link is identified by its anchor text
// ("buy tickets" / "RSVP" / etc.) rather than by domain, since a few shows use
// AXS or other ticketing platforms instead of Eventbrite. That real link is
// itself usually wrapped in a <noscript> fallback next to the widget's JS
// button (`<noscript><a href="...">Buy Tickets on Eventbrite</a></noscript>`),
// which cheerio's parser treats as opaque text rather than child markup — so
// ticket-link extraction runs a plain regex over the raw body HTML instead of
// walking cheerio's DOM.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "The Cedar Cultural Center";
const EVENTS_URL = "https://www.thecedar.org/events";
const JSON_URL = `${EVENTS_URL}?format=json`;
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const TIMEZONE = "America/Chicago";

// Rentals, orientations, and screenings — no lineup to attach a show to,
// labeled rather than dropped (mirrors acadia.ts).
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\bprivate event\b/i, "Private Event"],
  [/\bvolunteer orientation\b/i, "Volunteer Orientation"],
  [/\bfilm screening\b/i, "Film Screening"],
];

function classifyEventType(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

// Status markers and "X presents"/series prefixes worth stripping so the
// artist name underneath has a chance to fuzzy-match the directory.
const SERIES_PREFIXES: RegExp[] = [
  /^sold out\s*/i,
  /^an intimate evening with\s*/i,
  /^an evening with\s*/i,
  /^first avenue presents\s*/i,
  /^latin dance mn presents\s*/i,
  /^taikoarts midwest presents\s*/i,
  /^summer at the cedar\s*:\s*/i,
  /^the global get together with\s*/i,
];

// "❗" (status marker) and "☀️" (Summer at The Cedar bookends).
const DECORATION_RE = /[❗☀️]/g;

const DOORS_RE = /Doors:\s*(\d{1,2}:\d{2}\s*[AP]M)/i;
const ADV_DOS_RE = /\$(\d+(?:\.\d+)?)\s*Advance,\s*\$(\d+(?:\.\d+)?)\s*Day of Show/i;
const ANCHOR_RE = /<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;

type CedarEvent = {
  title: string;
  fullUrl: string;
  assetUrl?: string;
  body?: string;
  startDate: number;
};

type EventsJson = {
  upcoming: CedarEvent[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

/** Strip a known status marker or "presents"/series prefix, if present. */
function stripSeriesPrefix(title: string): string {
  for (const re of SERIES_PREFIXES) {
    if (re.test(title)) return title.replace(re, "").trim();
  }
  return title;
}

/** Drop a trailing " - subtitle" / " — subtitle" (tour or set name) off the
 * headliner, e.g. "CLAP YOUR HANDS SAY YEAH - Piano and Voice" -> "CLAP YOUR
 * HANDS SAY YEAH". Without this, a subtitle that happens to contain "and"
 * ("Piano and Voice") gets misread as a second act by the split below. */
function stripSubtitle(side: string): string {
  return side.split(/\s+[-—]\s+/)[0].trim();
}

/** Split a (already prefix-stripped) title into individual act names. */
function splitBands(rawTitle: string): string[] {
  // Protect known comma-containing act names ("Earth, Wind & Fire") before
  // any splitting, so the split below can't fragment them.
  const { text: protectedTitle, restore } = protectKnownNames(rawTitle);
  // "with" marks the headliner/support boundary, when present.
  const sides = protectedTitle.split(/\s+with\s+/i);
  sides[0] = stripSubtitle(sides[0]);
  const names = sides.flatMap((side) =>
    // The Oxford-comma alternatives must come before the bare comma one: for
    // "A, B, & C" the bare comma would otherwise consume ", " right up to the
    // "&", stranding "& C" as its own piece with no leading space left for
    // the "&" alternative to match.
    side.split(
      /\s*,\s*&\s+|\s*,\s*and\s+|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i,
    ),
  );
  return names.map(restore)
    .map((n) => n.trim().replace(/^special guest\s+/i, "").trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** Plain text of a Squarespace body block, whitespace-collapsed. */
function extractText(body: string): string {
  const $ = cheerio.load(body);
  return $.root().text().replace(/\s+/g, " ").trim();
}

/** The real per-show ticket link, identified by anchor text rather than
 * domain — thecedar.org's own `/ticket-info` and `/access` links share the
 * body but aren't a purchase link for this specific show. Scans the raw HTML
 * (see file header) rather than cheerio's DOM so <noscript>-wrapped links
 * aren't missed. */
function extractTicketUrl(body: string): string | null {
  for (const m of body.matchAll(ANCHOR_RE)) {
    const href = m[1];
    const text = m[2];
    if (!href || /^mailto:/i.test(href) || /thecedar\.org/i.test(href)) continue;
    if (/ticket|rsvp|buy/i.test(text)) return href;
  }
  return null;
}

/** "7:00 PM" -> "7:00pm", matching the other scrapers' format. */
function formatTime(raw: string): string {
  return raw.replace(/\s+/g, "").toLowerCase();
}

function parseDoorsTime(text: string): string | null {
  const m = DOORS_RE.exec(text);
  return m ? formatTime(m[1]) : null;
}

function parsePricing(text: string): {
  advancePrice: number | null;
  dosPrice: number | null;
} {
  const advDos = ADV_DOS_RE.exec(text);
  if (advDos) {
    return { advancePrice: parseFloat(advDos[1]), dosPrice: parseFloat(advDos[2]) };
  }
  if (/free/i.test(text)) return { advancePrice: null, dosPrice: null };
  const flat = text.match(/\$(\d+(?:\.\d+)?)/);
  if (flat) return { advancePrice: parseFloat(flat[1]), dosPrice: null };
  return { advancePrice: null, dosPrice: null };
}

/** Epoch ms -> "YYYY-MM-DD" and "7:30pm", both in the venue's local timezone. */
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

function parseEvent(event: CedarEvent): ScrapedShow | null {
  const rawTitle = decodeEntities(event.title)
    .replace(DECORATION_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tag = classifyEventType(rawTitle);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  if (tag) {
    // A non-band fixture: keep the raw title as the display name rather than
    // splitting it into "acts", mirroring hookandladder.ts.
    headliner = rawTitle;
    supporting = [];
    allBands = [];
  } else {
    allBands = splitBands(stripSeriesPrefix(rawTitle));
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
    sourceUrl: event.fullUrl ? `https://www.thecedar.org${event.fullUrl}` : EVENTS_URL,
    tag,
  };
}

export async function scrapeCedar(): Promise<ScrapedShow[]> {
  const res = await fetch(JSON_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`The Cedar request failed (${res.status} ${res.statusText})`);
  }
  const data: EventsJson = await res.json();
  return data.upcoming.map(parseEvent).filter((s): s is ScrapedShow => s !== null);
}
