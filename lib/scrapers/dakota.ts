// Scraper for The Dakota (Dakota Jazz Club & Restaurant).
//
// dakotacooks.com is WordPress running The Events Calendar plugin, which
// exposes a clean REST API at /wp-json/tribe/events/v1/events — paginated JSON
// with structured dates, genre categories, image, and a bag of per-event
// "custom fields" (Doors, Cost, Subtitle, artist "Learn More" link). No HTML
// parsing needed for the list; we page through it and read the fields off each
// event. `start_date` is already venue-local (each event carries
// timezone: "America/Chicago") and is the *show* time; doors comes from the
// Doors custom field.
//
// The Dakota is a jazz supper club — its event categories are all music genres
// (Jazz, Rock, R&B, Americana, …), so unlike cedar.ts/parkway.ts there's no
// "Movies"/"Comedy" category to key off. The only non-concert listings are
// identified by title: "Private Event" bookings and the occasional dining event
// ("Dinner Du Nord"). Those are kept but labeled with an event-type `tag` so
// they sit behind the "Show all events" toggle rather than the default concerts
// view, the same way cedar.ts tags its non-band fixtures.
//
// Two title-shaped quirks handled here:
//   - "VIP Event: <artist>" entries are a VIP pre-show package that duplicates
//     the same night's regular show (same date, an earlier 4:30pm "doors") — a
//     ticket tier, not a distinct public show. Dropped, so the night isn't
//     listed twice (and the VIP entry's earlier time can't clobber the real
//     show time).
//   - A handful of shows are Dakota-*presented* but at another room ("… at
//     Orchestra Hall", "… At The Ordway"). The real venue is parsed out of the
//     title and used instead of "The Dakota", and the suffix stripped so the
//     headliner matches the directory.
//
// The etix "Buy Tickets" link lives only on each event's rendered detail page,
// not in the REST payload — so rather than fetch all ~130 pages, the ticket
// link is the event page URL itself (which carries the Buy Tickets button).

import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "The Dakota";
const API_URL =
  "https://www.dakotacooks.com/wp-json/tribe/events/v1/events?per_page=50";
const EVENTS_URL = "https://www.dakotacooks.com/events/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// The Events Calendar exposes per-event "custom fields" under opaque keys; these
// are the ones we read (labels confirmed against the API's `label` values).
const CF_DOORS = "_ecp_custom_2";
const CF_COST = "_ecp_custom_26";

// Non-concert listings, recognizable only by title (the Dakota's categories are
// all music genres). Kept but labeled, mirroring cedar.ts — deliberately narrow
// so a real booked show is never mislabeled and hidden from the concerts view.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\bprivate event\b/i, "Private Event"],
  [/\bdinner\b/i, "Dining"],
  [/\bbrunch\b/i, "Brunch"],
  [/\bgala\b/i, "Gala"],
  [/\bfundraiser\b/i, "Fundraiser"],
  [/\btrivia\b/i, "Trivia"],
];

function classifyByTitle(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

// Presenter phrases prepended to a title; stripped so the headliner underneath
// matches the directory. "An Evening with X" would otherwise get "An Evening"
// stranded as the headliner by the " with " band-split.
const STATUS_PREFIXES: RegExp[] = [/^an (?:intimate )?evening with\s+/i];

type CustomField = { label?: string; value?: string };

type DakotaCategory = { name?: string; slug?: string };

type DakotaEvent = {
  title: string;
  url: string;
  slug?: string;
  start_date: string; // "YYYY-MM-DD HH:MM:SS", venue-local
  start_date_details?: { year: string; month: string; day: string; hour: string; minutes: string };
  image?: { url?: string } | false;
  custom_fields?: Record<string, CustomField>;
  // The Events Calendar event categories. At the Dakota these are all music
  // genres (Jazz, R&B, Americana, …), so they double as the show's genre tags.
  categories?: DakotaCategory[];
};

type EventsJson = {
  events: DakotaEvent[];
  total_pages?: number;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, "\"");
}

function cf(event: DakotaEvent, key: string): string | null {
  return event.custom_fields?.[key]?.value?.trim() || null;
}

/** Strip a leading presenter phrase ("An Evening with …"), if present. */
function stripStatusPrefix(title: string): string {
  for (const re of STATUS_PREFIXES) {
    if (re.test(title)) return title.replace(re, "").trim();
  }
  return title;
}

/** Drop a trailing spaced-dash subtitle (tour/album/set name) off the
 * headliner, e.g. "Judy Collins: Sweet Judy Blue Eyes – Farewell" ->
 * "Judy Collins: Sweet Judy Blue Eyes", so a subtitle containing "and"/"with"
 * can't be misread as a support act by splitBands. Also trims a dangling
 * separator ("Robert Earl Keen:", "The Devon Allman Project:") left when the
 * subtitle proper lives in the API's separate Subtitle field. */
function stripSubtitle(title: string): string {
  return title
    .split(/\s+[–—-]\s+/)[0]
    .replace(/\s*[:\-–—]\s*$/, "")
    .trim();
}

const OFFSITE_VENUE_RE = /^(.+?)\s+at\s+(.+)$/i;
const VENUE_WORD_RE =
  /\b(hall|theatre|theater|ordway|centre|center|pavilion|amphitheater|ballroom)\b/i;

/** A few Dakota-presented shows play another room ("… at Orchestra Hall",
 * "… At The Ordway"). Split the real venue out of the title so the headliner is
 * clean and the show isn't mislabeled as being at the Dakota. Only fires when
 * the part after " at " actually names a venue (has a venue word), so a normal
 * title isn't torn apart. */
function splitOffsiteVenue(title: string): { title: string; venue: string | null } {
  const m = title.match(OFFSITE_VENUE_RE);
  if (!m || !VENUE_WORD_RE.test(m[2])) return { title, venue: null };
  const venue = m[2].trim().replace(/^the\s+/i, "The ");
  return { title: m[1].trim(), venue };
}

/** Split a (already cleaned) title into individual act names. Mirrors
 * cedar.ts/parkway.ts, with "w/" added as a headliner/support boundary. */
function splitBands(cleanTitle: string): string[] {
  const { text: protectedTitle, restore } = protectKnownNames(cleanTitle);
  const sides = protectedTitle.split(
    /\s+w\/\s*|\s+with\s+special\s+guests?\s+|\s+with\s+/i,
  );
  const names = sides.flatMap((side) =>
    side.split(
      /\s*,\s*&\s+|\s*,\s*and\s+|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+\+\s+|\s+featuring\s+|\s+feat\.\s+|\s+ft\.\s+/i,
    ),
  );
  return names
    .map(restore)
    .map((n) => n.trim().replace(/^special guests?\s+/i, "").trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i;

/** "5:30PM" / "7PM" -> "5:30pm" / "7:00pm", matching the other scrapers. */
function formatTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = TIME_RE.exec(raw);
  if (!m) return null;
  return `${parseInt(m[1], 10)}:${m[2] ?? "00"}${m[3].toLowerCase()}m`;
}

/** "From $25.47" / "FREE" -> 25.47 / null. */
function parseCost(raw: string | null): number | null {
  if (!raw || /free/i.test(raw)) return null;
  const m = raw.match(/\$\s?(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** start_date_details -> "YYYY-MM-DD" and "7:00pm" (already venue-local). */
function dateAndTime(event: DakotaEvent): { date: string | null; time: string | null } {
  const d = event.start_date_details;
  if (!d) return { date: null, time: null };
  const date = `${d.year}-${d.month}-${d.day}`;
  let hour = parseInt(d.hour, 10) % 24;
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return { date, time: `${hour}:${d.minutes}${suffix}` };
}

function parseEvent(event: DakotaEvent): ScrapedShow | null {
  const rawTitle = decodeEntities(event.title).replace(/\s+/g, " ").trim();

  // VIP pre-show packages duplicate the night's real show — drop them.
  if (/^vip event\b/i.test(rawTitle)) return null;

  const offsite = splitOffsiteVenue(rawTitle);
  const cleanTitle = stripSubtitle(stripStatusPrefix(offsite.title));

  const tag = classifyByTitle(rawTitle);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  if (tag) {
    // A non-band fixture (private booking, dinner): keep the cleaned title as
    // the display name rather than splitting it into acts. Mirrors cedar.ts.
    headliner = cleanTitle;
    supporting = [];
    allBands = [];
  } else {
    allBands = splitBands(cleanTitle);
    if (allBands.length === 0) return null;
    [headliner, ...supporting] = allBands;
  }

  const { date, time: musicTime } = dateAndTime(event);
  const flyerUrl = event.image && event.image.url ? event.image.url : null;

  // Categories are the venue's own genre tags — carry them as suggestions
  // (decoded like titles; normalizeGenres tidies/dedupes downstream). A
  // non-concert fixture (private event, dining) gets none.
  const genres = tag
    ? []
    : (event.categories ?? [])
        .map((c) => (c.name ? decodeEntities(c.name).trim() : ""))
        .filter(Boolean);

  return {
    venue: offsite.venue ?? VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl,
    genres,
    // The etix Buy Tickets button lives on the event page, not in the API, so
    // the event page is both the source and the ticketing link.
    ticketUrl: event.url || null,
    doorsTime: formatTime(cf(event, CF_DOORS)),
    musicTime,
    advancePrice: parseCost(cf(event, CF_COST)),
    dosPrice: null,
    sourceUrl: event.url || EVENTS_URL,
    tag,
  };
}

export async function scrapeDakota(): Promise<ScrapedShow[]> {
  const shows: ScrapedShow[] = [];
  let page = 1;
  // The Events Calendar paginates; page 1 reports total_pages. Cap the loop as
  // a guard against a runaway paginator.
  for (let guard = 0; guard < 50; guard++) {
    const res = await fetch(`${API_URL}&page=${page}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `The Dakota request failed (${res.status} ${res.statusText})`,
      );
    }
    const data: EventsJson = await res.json();
    for (const event of data.events ?? []) {
      const show = parseEvent(event);
      if (show) shows.push(show);
    }
    if (!data.total_pages || page >= data.total_pages) break;
    page++;
  }
  return shows;
}
