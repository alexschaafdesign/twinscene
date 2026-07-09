// Scraper for Icehouse's calendar.
//
// https://icehouse.turntabletickets.com/ is a Turntable Tickets storefront —
// the rendered page is server-side HTML with no embedded JSON, but the guest
// bundle hydrates the listing from a public JSON API on the same subdomain
// (multi-tenant: the venue is selected by hostname, not a query param):
// GET /api/performance/?booking=true&pagination=false
// which returns every currently-bookable performance in one response (no
// paging needed — `results.length` matched `count` in testing).
//
// Each performance nests its show (name, flyer image, and a free-text
// `description`). That description is where doors/showtime and pricing live,
// written by venue staff — usually plain "\n"-joined lines, occasionally
// `<p>`/`<br>` HTML, so lines are extracted after stripping any tags. Known
// formatting quirks handled below: "Door"/"Doors"/"Door Time" as the doors
// suffix, "Adv"/"Advance" for the presale price, a flat "$X Tickets" price
// with no adv/door split, and an occasional single "$X Adv & Doors" price
// covering both. VIP add-on lines ("*$30 VIP Add on") are asterisk-prefixed
// and never confused for the real price since the money regexes anchor on a
// bare "$".
//
// The `datetime` field on a performance is meant to be the showtime, but was
// observed off-by-one-field on at least one listing (matching doors instead) —
// so it's used only for the calendar date, never for doors/music time; those
// always come from parsing the description text, same as what the page itself
// displays.
//
// Icehouse is a dedicated ticketed venue (not a bar with recurring non-music
// filler like trivia/bingo), so unlike some other scrapers there's no
// non-music keyword filter here — every bookable performance is treated as a
// show.

import type { ScrapedShow } from "./types";

const VENUE = "Icehouse";
const BASE_URL = "https://icehouse.turntabletickets.com";
const API_URL = `${BASE_URL}/api/performance/?booking=true&pagination=false`;
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const TIMEZONE = "America/Chicago";

const DOORS_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*door/i;
const SHOWTIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*show(?:\s*time)?\b/i;
const ADV_AND_DOORS_RE = /^\$(\d+(?:\.\d+)?)\s*adv(?:ance)?\s*(?:&|and)\s*doors?\b/i;
const ADV_PRICE_RE = /^\$(\d+(?:\.\d+)?)\s*adv/i;
const DOOR_PRICE_RE = /^\$(\d+(?:\.\d+)?)\s*door/i;
const FLAT_TICKET_PRICE_RE = /^\$(\d+(?:\.\d+)?)\s*tickets?\b/i;
// Some listings just say "$15 (+fees & taxes)" or "$10 Cover" — a single price
// with no adv/door/ticket label at all. Used only if nothing more specific matched.
const BARE_PRICE_RE = /^\$(\d+(?:\.\d+)?)\b/;

type Performance = {
  id: number;
  datetime: string; // ISO 8601, UTC
  show_id: number;
  show: {
    id: number;
    name: string;
    image: string | null;
    description: string;
  };
};

type PerformanceResponse = {
  count: number;
  results: Performance[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** A show's description is free text — sometimes plain "\n"-joined, sometimes
 * `<p>`/`<br>` HTML — so normalize both into a flat list of trimmed lines. */
function extractLines(description: string): string[] {
  const text = description
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildTime(hour: string, minute: string | undefined, ampm: string): string {
  return `${parseInt(hour, 10)}:${minute ?? "00"}${ampm.toLowerCase()}`;
}

/** Split a show name into individual act names — this venue mixes "w/",
 * "with", "//", "/", "&", "+", "x", and comma-separated bills. */
function splitBands(rawName: string): string[] {
  const name = decodeEntities(rawName).trim();
  const sides = name.split(/\s+w\/\s*|\s+with\s+/i);
  const names = sides.flatMap((side) =>
    side.split(
      /\s*\/\/\s*|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+feat\.\s+|\s+ft\.\s+/i,
    ),
  );
  return names
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

function parsePerformance(perf: Performance): ScrapedShow {
  const allBands = splitBands(perf.show.name);
  const [headliner, ...supporting] = allBands.length
    ? allBands
    : [perf.show.name.trim()];

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(perf.datetime));

  let doorsTime: string | null = null;
  let musicTime: string | null = null;
  let advancePrice: number | null = null;
  let dosPrice: number | null = null;
  let barePrice: number | null = null;

  for (const line of extractLines(perf.show.description)) {
    let m: RegExpExecArray | null;

    if (doorsTime === null && (m = DOORS_RE.exec(line))) {
      doorsTime = buildTime(m[1], m[2], m[3]);
      continue;
    }
    if (musicTime === null && (m = SHOWTIME_RE.exec(line))) {
      musicTime = buildTime(m[1], m[2], m[3]);
      continue;
    }
    if (advancePrice === null && dosPrice === null && (m = ADV_AND_DOORS_RE.exec(line))) {
      advancePrice = parseFloat(m[1]);
      dosPrice = parseFloat(m[1]);
      continue;
    }
    if (advancePrice === null && (m = ADV_PRICE_RE.exec(line))) {
      advancePrice = parseFloat(m[1]);
      continue;
    }
    if (dosPrice === null && (m = DOOR_PRICE_RE.exec(line))) {
      dosPrice = parseFloat(m[1]);
      continue;
    }
    if (advancePrice === null && (m = FLAT_TICKET_PRICE_RE.exec(line))) {
      advancePrice = parseFloat(m[1]);
      continue;
    }
    if (barePrice === null && (m = BARE_PRICE_RE.exec(line))) {
      barePrice = parseFloat(m[1]);
      continue;
    }
  }

  if (advancePrice === null && dosPrice === null && barePrice !== null) {
    advancePrice = barePrice;
  }

  const showUrl = `${BASE_URL}/shows/${perf.show_id}/?date=${date}`;

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands: allBands.length ? allBands : [perf.show.name.trim()],
    flyerUrl: perf.show.image || null,
    ticketUrl: showUrl,
    doorsTime,
    musicTime,
    advancePrice,
    dosPrice,
    sourceUrl: showUrl,
  };
}

export async function scrapeIcehouse(): Promise<ScrapedShow[]> {
  const res = await fetch(API_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Icehouse request failed (${res.status} ${res.statusText})`);
  }
  const data: PerformanceResponse = await res.json();
  return data.results.map(parsePerformance);
}
