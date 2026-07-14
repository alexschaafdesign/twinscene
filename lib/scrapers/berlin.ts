// Scraper for Berlin (Minneapolis)'s calendar.
//
// The site is Squarespace, and Squarespace calendar/events collection pages
// expose their full "upcoming" list as JSON at `?format=json` — no HTML
// parsing needed. Each item's `startDate`/`endDate` are UTC epoch ms; we
// convert to America/Chicago (the venue's timezone) for both the date and
// the show time rather than trying to regex a time out of the excerpt text,
// since the two agree exactly and the epoch is far more reliable.
//
// Berlin's calendar mixes real bookings with recurring non-band series:
// a weekly open jam and a "Crates" album-listening-party series (they play a
// classic album front to back — no performer to attach the show to). Both
// are excluded by title. Everything else is a booking, but the titles
// themselves are inconsistent: most are "Headliner w/ Support" or a bare
// artist name, but recurring curated nights prefix the artist with a series
// name ("Late Night Lounge: ", "Early Evening Jazz: ", "Nocturne: ",
// "Curated by X: feat. "). We strip those known prefixes so the artist name
// underneath has a chance to fuzzy-match the directory; anything else
// (tribute-show subtitles, "Artist: Event Name" listings, dense multi-act
// bills joined by "/" or "x") is passed through as-is and falls back to the
// review queue like any other scraper's ambiguous case.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "Berlin";
const CALENDAR_URL = "https://www.berlinmpls.com/calendar";
const JSON_URL = `${CALENDAR_URL}?format=json`;
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const TIMEZONE = "America/Chicago";

// Recurring listings with no performer to attach the show to.
const NON_MUSIC_RE = /\b(open jam|jam session)\b/i;
const CRATES_RE = /^crates:/i;

// "Series: Artist" prefixes worth stripping so the artist name underneath can
// fuzzy-match the directory. Order doesn't matter; only one will ever match.
const SERIES_PREFIXES: RegExp[] = [
  /^late night lounge:\s*/i,
  /^early evening jazz:\s*/i,
  /^nocturne:\s*/i,
  /^curated by [^:]+:\s*(feat\.?\s*)?/i,
];

type SquarespaceEvent = {
  title: string;
  fullUrl: string;
  assetUrl?: string;
  excerpt?: string;
  startDate: number;
  endDate: number;
};

type CalendarJson = {
  upcoming: SquarespaceEvent[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

/** Split a (already prefix-stripped) title into individual act names. */
function splitBands(rawTitle: string): string[] {
  const title = decodeEntities(rawTitle).trim();
  // Protect known comma-containing act names ("Earth, Wind & Fire") before
  // any splitting, so the split below can't fragment them.
  const { text: protectedTitle, restore } = protectKnownNames(title);
  // "w/" marks the headliner/support boundary, when present.
  const sides = protectedTitle.split(/\s+w\/\s+/i);
  const names = sides.flatMap((side) =>
    // The Oxford-comma alternatives must come before the bare comma one: for
    // "A, B, & C" the bare comma would otherwise consume ", " right up to the
    // "&", stranding "& C" as its own piece with no leading space left for
    // the "&" alternative to match.
    side.split(
      /\s*,\s*&\s+|\s*,\s*and\s+|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i,
    ),
  );
  return names
    .map((n) => restore(n).trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** Strip a known recurring-series prefix off a title, if present. */
function stripSeriesPrefix(title: string): string {
  for (const re of SERIES_PREFIXES) {
    if (re.test(title)) return title.replace(re, "");
  }
  return title;
}

/** Extract the "GET TICKETS" link from the excerpt HTML, if any. */
function extractTicketUrl(excerpt: string | undefined): string | null {
  if (!excerpt) return null;
  const $ = cheerio.load(excerpt);
  const href = $("a[href]").first().attr("href");
  return href || null;
}

/** Pull advance/day-of-show pricing out of the excerpt's plain text. */
function parsePricing(text: string): {
  advancePrice: number | null;
  dosPrice: number | null;
} {
  const advDos = text.match(
    /\$(\d+(?:\.\d+)?)\s*ADV\s*\/\s*\$(\d+(?:\.\d+)?)\s*DOS/i,
  );
  if (advDos) {
    return {
      advancePrice: parseFloat(advDos[1]),
      dosPrice: parseFloat(advDos[2]),
    };
  }
  const atDoor = text.match(/\$(\d+(?:\.\d+)?)\s*at the door/i);
  if (atDoor) return { advancePrice: null, dosPrice: parseFloat(atDoor[1]) };
  if (/no cover/i.test(text)) return { advancePrice: null, dosPrice: null };
  const flat = text.match(/\$(\d+(?:\.\d+)?)/);
  if (flat) return { advancePrice: parseFloat(flat[1]), dosPrice: null };
  return { advancePrice: null, dosPrice: null };
}

/** Epoch ms -> "YYYY-MM-DD" and "7:00pm", both in the venue's local timezone. */
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

function parseEvent(event: SquarespaceEvent): ScrapedShow | null {
  const rawTitle = decodeEntities(event.title);
  if (NON_MUSIC_RE.test(rawTitle) || CRATES_RE.test(rawTitle)) return null;

  const allBands = splitBands(stripSeriesPrefix(rawTitle));
  if (allBands.length === 0) return null;
  const [headliner, ...supporting] = allBands;

  const excerptText = event.excerpt
    ? cheerio.load(event.excerpt).text()
    : "";
  const { date, time } = localDateAndTime(event.startDate);
  const { advancePrice, dosPrice } = parsePricing(excerptText);

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: event.assetUrl || null,
    ticketUrl: extractTicketUrl(event.excerpt),
    doorsTime: null,
    musicTime: time,
    advancePrice,
    dosPrice,
    sourceUrl: event.fullUrl
      ? `https://www.berlinmpls.com${event.fullUrl}`
      : CALENDAR_URL,
  };
}

export async function scrapeBerlin(): Promise<ScrapedShow[]> {
  const res = await fetch(JSON_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Berlin request failed (${res.status} ${res.statusText})`);
  }
  const data: CalendarJson = await res.json();
  return data.upcoming.map(parseEvent).filter((s): s is ScrapedShow => s !== null);
}
