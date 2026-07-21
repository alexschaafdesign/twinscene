// Scraper for Indeed Brewing Co.'s Minneapolis taproom calendar.
//
// Like whitesquirrel.ts, this venue runs the WordPress "The Events Calendar"
// (Tribe) plugin, which exposes a public JSON REST API
// (wp-json/tribe/events/v1/events) — no HTML parsing needed. Indeed has two
// taprooms (Minneapolis + Milwaukee) distinguished only by a Tribe *category*
// (id 11 = Minneapolis, 12 = Milwaukee; there's no "genre"/type taxonomy on
// this site), which is exactly what the user-facing calendar's
// `tribe_eventcategory[0]=11` filter selects — so the API call mirrors that
// with `categories=11` to stay Minneapolis-only, matching every other venue
// in this directory.
//
// Per-event `timezone` is unreliable (some rows report "UTC+0" instead of
// "America/Chicago", and `utc_start_date` just copies the same wall-clock
// value rather than actually converting it — a bug on Indeed's end, not
// something we can detect and correct for). So, like whitesquirrel.ts, this
// ignores the timezone metadata entirely and trusts `start_date`'s
// "YYYY-MM-DD HH:MM:SS" as already being venue-local (America/Chicago).
//
// The Minneapolis category is *all* taproom events, not just music — trivia,
// a monthly charity taproom-proceeds day, a science-museum talk series, a
// vintage market, etc. share it with the two recurring live-music series.
// Rather than dropping those, every event is kept and classified from its
// title (mirroring hookandladder.ts/whitesquirrel.ts): recognized non-music
// series get an event-type `tag` with an empty `allBands` so the label can't
// be mistaken for a band; anything unrecognized falls back to a generic
// "Event" tag rather than silently disappearing or (worse) being imported as
// a fake band named after the event.
//
// The two music formats need their own parsing, since neither is a plain
// "headliner w/ support" title:
//   - "Off The Dock – <act>" is the venue's free weekly patio series; the act
//     name is simply everything after the en dash.
//   - "<act>'s BIG SHOW @ Indeed Brewing[...]" is a ticketed one-off; the
//     headliner is the possessive prefix, and any opener is named in prose in
//     the post excerpt ("Opening act by X.") rather than the title, so that's
//     pulled from `excerpt` with its own regex.

import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "Indeed Brewing Co.";
const CALENDAR_URL = "https://indeedbrewing.com/events/list/?tribe_eventcategory[0]=11";
const API_BASE = "https://indeedbrewing.com/wp-json/tribe/events/v1/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const MINNEAPOLIS_CATEGORY = 11;
const PER_PAGE = 50;

// Recurring non-music taproom events, matched against the title in order
// (first hit wins). Series names are specific to this venue; the generic
// keyword rules below catch one-off events of a similar shape. Anything that
// matches nothing falls back to "Event" so it still shows up flagged as a
// non-show rather than vanishing.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/^Science in the Ox\b/i, "Science Talk"],
  [/^Indeed We Can\b/i, "Charity Event"],
  [/^Pitch-A-Friend\b/i, "Singles Event"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
  [/\bmarket\b|\bpop-?up\b/i, "Market"],
  [/\byoga\b/i, "Yoga"],
  [/\bcomedy\b|stand-?up/i, "Comedy"],
  [/\brun club\b/i, "Run Club"],
  [/\btap ?takeover\b|\bbeer release\b/i, "Beer Release"],
];

function classifyEventType(title: string): string {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return "Event";
}

// Tribe REST API shape, trimmed to the fields we use.
type TribeEvent = {
  id: number;
  title: string;
  excerpt: string;
  url: string;
  start_date: string; // "YYYY-MM-DD HH:MM:SS", venue-local despite the (unreliable) `timezone` field
  image: { url: string } | false;
  cost: string;
};

type TribeEventsPage = {
  events: TribeEvent[];
  total_pages: number;
};

/** Decode the numeric/named HTML entities WordPress leaves in JSON strings. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Split a lineup fragment ("Aby Wolf & Kavyesh Kaviraj w/ LSQ") into
 * individual act names — same splitting rules as whitesquirrel.ts's
 * splitBands, reused here for the "Opening act by ..." excerpt text. */
function splitActs(raw: string): string[] {
  const { text: protectedText, restore } = protectKnownNames(raw.trim());
  const sides = protectedText.split(/\s+w\/\s+|\s+w\.\s+/i);
  const names = sides.flatMap((side) =>
    side.split(/\s*,\s*&\s+|\s*,\s*and\s+|\s*,\s*|\s+&\s+|\s+and\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i),
  );
  return names.map(restore)
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** Pull supporting act(s) out of a BIG SHOW post's excerpt prose, e.g.
 * "Opening act by Lupin." -> ["Lupin"]. Best-effort: absent or unparseable
 * just yields no supporting acts, which is fine — the headliner still shows. */
function extractOpeners(excerptHtml: string): string[] {
  const text = decodeEntities(stripTags(excerptHtml));
  const m = /opening acts?\s+by\s+([^.!]+)[.!]/i.exec(text);
  if (!m) return [];
  return splitActs(m[1]);
}

/** "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD". */
function datePart(s: string): string {
  return s.slice(0, 10);
}

/** "YYYY-MM-DD HH:MM:SS" -> "7:00pm". */
function timePart(s: string): string | null {
  const m = /(\d{2}):(\d{2}):\d{2}$/.exec(s);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${suffix}`;
}

/** Lowest number in a cost string ("$15", "$15 - $20"). Empty/free -> null.
 * Indeed's API hasn't shown a populated `cost` in practice (even ticketed BIG
 * SHOW events come back with cost: ""), but this covers it if that changes. */
function parseAdvancePrice(cost: string): number | null {
  if (!cost || /free/i.test(cost)) return null;
  const nums = cost.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  return Math.min(...nums.map((n) => parseFloat(n)));
}

const OFF_THE_DOCK_RE = /^Off The Dock\s*[–—-]\s*(.+)$/i;
const BIG_SHOW_RE = /^(.+?)['’]s BIG SHOW\b/i;

function parseEvent(event: TribeEvent): ScrapedShow | null {
  const title = decodeEntities(event.title).trim();
  if (!title) return null;

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  let tag: string | null;

  const bigShow = BIG_SHOW_RE.exec(title);
  const offTheDock = OFF_THE_DOCK_RE.exec(title);
  if (bigShow) {
    headliner = bigShow[1].trim();
    supporting = extractOpeners(event.excerpt);
    allBands = [headliner, ...supporting];
    tag = null;
  } else if (offTheDock) {
    headliner = offTheDock[1].trim();
    supporting = [];
    allBands = [headliner];
    tag = null;
  } else {
    // Not a recognized music format — keep it, but label what it is.
    headliner = title;
    supporting = [];
    allBands = [];
    tag = classifyEventType(title);
  }

  return {
    venue: VENUE,
    date: datePart(event.start_date),
    headliner,
    supporting,
    allBands,
    flyerUrl: event.image ? event.image.url : null,
    // The taproom calendar doesn't expose a ticket link through the API
    // (`cost`/`website` are empty even for the ticketed BIG SHOW events) —
    // link to the event's own page instead.
    ticketUrl: event.url || null,
    doorsTime: null,
    musicTime: timePart(event.start_date),
    advancePrice: parseAdvancePrice(event.cost),
    dosPrice: null,
    sourceUrl: event.url || CALENDAR_URL,
    tag,
  };
}

/** Fetch one page of upcoming Minneapolis-taproom events from the Tribe REST API. */
async function fetchPage(page: number, startDate: string): Promise<TribeEventsPage> {
  const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}&start_date=${startDate}&categories=${MINNEAPOLIS_CATEGORY}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Indeed Brewing request failed (${res.status} ${res.statusText})`,
    );
  }
  return res.json();
}

export async function scrapeIndeedBrewing(): Promise<ScrapedShow[]> {
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
