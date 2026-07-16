// Scraper for White Squirrel Bar's calendar.
//
// Unlike the other HTML scrapers, White Squirrel runs The Events Calendar
// (Tribe) WordPress plugin, which exposes a public JSON REST API
// (wp-json/tribe/events/v1/events) — no HTML parsing needed. Dates come back
// already in the venue's local time (each event carries its own `timezone`,
// consistently "America/Chicago"), and the API supports a `start_date` filter
// and pagination, so we ask it for upcoming events directly rather than
// fetching everything and filtering client-side.
//
// One wrinkle this venue has that Pilllar/First Avenue don't: its calendar
// lists *every* bar event — yoga, bingo, karaoke, open jam — not just music
// shows, and Tribe's categories/tags are unused on this site (always empty),
// so there's no structured way to tell them apart. We match a short list of
// known non-music keywords and label those with an event-type tag rather
// than dropping them, mirroring hookandladder.ts/acadia.ts. It's not
// exhaustive — an ambiguous one-off title can still slip through untagged —
// but anything that does just fails to fuzzy-match a directory band and sits
// harmlessly in the review queue rather than auto-importing (same fallback
// the flyer scrapers already lean on for bad matches).
//
// Show titles pack the whole bill into one string (e.g. "Gradience w. Heed
// The Warning, Buzz Box"), so we split on "w./w/" for the headliner/support
// boundary and on "&/and/+/featuring/commas" within each side. This has the
// same known false-split risk as Pilllar's "with A, B, and C" parsing: a band
// literally named e.g. "Earth, Wind & Fire" gets split into pieces —
// protectKnownNames (knownActNames.ts) shields a short list of known cases
// from that; anything not on the list still splits wrong and needs a manual
// fix in /admin/review.

import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "White Squirrel Bar";
const CALENDAR_URL = "https://whitesquirrelbar.com/calendar/";
const API_BASE = "https://whitesquirrelbar.com/wp-json/tribe/events/v1/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const PER_PAGE = 50;

// Recurring non-music bar events. Deliberately short and specific rather than
// broad, so it doesn't risk swallowing a real band name. Extend this list if
// another recurring non-music event type shows up in the review queue.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\byoga\b/i, "Yoga"],
  [/\bbingo\b/i, "Bingo"],
  [/\btrivia\b/i, "Trivia"],
  [/\b(open jam|jam session)\b/i, "Jam"],
  [/\bdrag\b/i, "Drag Show"],
  [/\bmovie night\b/i, "Movie Night"],
  // Catches "karaoke" and stylized "-oke"/"⭑oke" suffixes ("COUNTRY⭑OKE")
  // without a letter immediately before "oke" — so it doesn't also match a
  // real name that happens to end in "oke" ("Alex & Toke's Acoustic Tuesdays").
  [/karaoke|(?<![a-z])oke\b/i, "Karaoke"],
];

function classifyEventType(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

// Tribe REST API shapes, trimmed to the fields we use.
type TribeEvent = {
  id: number;
  title: string;
  url: string;
  start_date: string; // "YYYY-MM-DD HH:MM:SS", local per `timezone`
  end_date: string;
  image: { url: string } | false;
};

type TribeEventsPage = {
  events: TribeEvent[];
  total_pages: number;
};

/** Decode the numeric/named HTML entities WordPress leaves in JSON titles. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

/** Split a show title into individual band names, dropping TBA/TBD. */
function splitBands(rawTitle: string): string[] {
  const title = decodeEntities(rawTitle).trim();
  // Protect known comma-containing act names ("Earth, Wind & Fire") before
  // any splitting, so the split below can't fragment them.
  const { text: protectedTitle, restore } = protectKnownNames(title);
  // "w."/"w/" marks the headliner/support boundary (mirrors Pilllar's "with").
  const sides = protectedTitle.split(/\s+w\/\s+|\s+w\.\s+/i);
  const names = sides.flatMap((side) =>
    // The Oxford-comma alternatives must come before the bare comma one: for
    // "A, B, & C" the bare comma would otherwise consume ", " right up to the
    // "&", stranding "& C" as its own piece with no leading space left for
    // the "&" alternative to match.
    side.split(/\s*,\s*&\s+|\s*,\s*and\s+|\s*,\s*|\s+&\s+|\s+and\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i),
  );
  return names.map(restore)
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD". */
function datePart(s: string): string {
  return s.slice(0, 10);
}

/** "YYYY-MM-DD HH:MM:SS" -> "7:00pm", matching the flyer scrapers' format. */
function timePart(s: string): string | null {
  const m = /(\d{2}):(\d{2}):\d{2}$/.exec(s);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${suffix}`;
}

function parseEvent(event: TribeEvent): ScrapedShow | null {
  const decodedTitle = decodeEntities(event.title);
  const tag = classifyEventType(decodedTitle);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  if (tag) {
    // A non-music bar event: keep the raw title as the display name rather
    // than splitting it into "acts", mirroring hookandladder.ts.
    headliner = decodedTitle;
    supporting = [];
    allBands = [];
  } else {
    allBands = splitBands(event.title);
    if (allBands.length === 0) return null;
    [headliner, ...supporting] = allBands;
  }

  return {
    venue: VENUE,
    date: datePart(event.start_date),
    headliner,
    supporting,
    allBands,
    flyerUrl: event.image ? event.image.url : null,
    // The venue doesn't sell tickets through this calendar (cost/website are
    // always empty) — link to the event's own page instead.
    ticketUrl: null,
    doorsTime: null,
    musicTime: timePart(event.start_date),
    advancePrice: null,
    dosPrice: null,
    sourceUrl: event.url || CALENDAR_URL,
    tag,
  };
}

/** Fetch one page of upcoming events from the Tribe REST API. */
async function fetchPage(page: number, startDate: string): Promise<TribeEventsPage> {
  const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}&start_date=${startDate}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `White Squirrel request failed (${res.status} ${res.statusText})`,
    );
  }
  return res.json();
}

export async function scrapeWhiteSquirrel(): Promise<ScrapedShow[]> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const first = await fetchPage(1, today);
  const pages = [first];
  for (let page = 2; page <= first.total_pages; page++) {
    pages.push(await fetchPage(page, today));
  }

  const events = pages.flatMap((p) => p.events);
  return events.map(parseEvent).filter((s): s is ScrapedShow => s !== null);
}
