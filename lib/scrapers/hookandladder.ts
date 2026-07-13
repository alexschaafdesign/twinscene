// Scraper for The Hook and Ladder's events calendar.
//
// https://thehookmpls.com/events/ is an Astro site whose events grid is a
// client island (`<astro-island component-url=".../EventsBrowser...">`). Astro
// serializes that island's props into the page's HTML as an HTML-escaped JSON
// blob on the `props` attribute, so the full upcoming list (~6 months out at a
// time) is already in the initial HTML — no separate API call or headless
// render needed. The data ultimately comes from the venue's Opendate account,
// which is why each event carries an `app.opendate.io/e/...` ticketing URL.
//
// Astro's prop serialization wraps every value as `[TYPE, value]` (0 = plain
// value/object, 1 = array), recursively, so the blob is JSON.parse'd and then
// unwrapped back into ordinary objects before use (see `unwrapAstro`).
//
// Each event exposes a structured `performers` lineup (`{name, actType}`, where
// actType is "headline" or "support") — like greenroom.ts's VenuePilot feed,
// that's cleaner than splitting a title. Rather than drop the listings that
// have no lineup, this scraper keeps every event and labels the lineup-less
// ones with an event-type `tag` (Private Event, Record Sale, Meetup, …) derived
// from the title, so non-shows land in the import review clearly marked instead
// of silently disappearing. Those tagged rows carry the title as their sole
// "band" so they queue for review (a lineup-less show would otherwise look
// auto-importable) rather than getting linked to the directory.
//
// `doorTime`/`startTime` are ISO timestamps with the venue-local offset, mapped
// to doors/music time; `priceRange` is a fee-inclusive string ("$28.91",
// "$22.65 to $82.77", "FREE", or null) whose lowest number is taken as the
// advance/starting price — it's a ticket-tier range, not an advance/day-of
// split, so dosPrice is left null.

import type { ScrapedShow } from "./types";

const VENUE = "The Hook and Ladder";
const EVENTS_URL = "https://thehookmpls.com/events/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const TIMEZONE = "America/Chicago";

// The EventsBrowser island's props attribute — `component-url` reliably comes
// before `props` in Astro's rendered tag, and the value has no literal `>` or
// `"` (both are HTML-escaped inside it), so these character classes are safe.
const ISLAND_RE =
  /<astro-island\b[^>]*\bcomponent-url="[^"]*EventsBrowser[^"]*"[^>]*\bprops="([^"]*)"/;

type Performer = {
  name: string;
  actType: string; // "headline" | "support"
};

type HookEvent = {
  title: string;
  publicTicketingUrl: string | null;
  venuePermalink: string | null;
  image: string | null;
  priceRange: string | null;
  doorTime: string | null; // ISO 8601 w/ venue-local offset
  startTime: string | null;
  canceledAt: string | null;
  performers: Performer[];
};

/** Reverse one level of HTML entity escaping (attribute-level). `&amp;` is
 * handled last so an already-escaped entity like `&amp;quot;` decodes to the
 * literal `&quot;` (data) rather than a stray `"`. */
function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

/** Undo Astro's `[TYPE, value]` prop serialization (0 = plain value/object,
 * 1 = array), recursively, into a plain value. */
function unwrapAstro(node: unknown): unknown {
  if (Array.isArray(node) && node.length === 2 && typeof node[0] === "number") {
    const [type, value] = node;
    if (type === 1) {
      return (value as unknown[]).map(unwrapAstro);
    }
    // type 0 (and any other scalar wrapper we don't special-case)
    if (Array.isArray(value)) return value.map(unwrapAstro);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = unwrapAstro(v);
      return out;
    }
    return value;
  }
  return node;
}

/** ISO timestamp -> "YYYY-MM-DD" and "7:30pm", both in the venue's timezone. */
function localDateAndTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;

  let hour = parseInt(get("hour"), 10) % 24;
  const minute = get("minute");
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return { date, time: `${hour}:${minute}${suffix}` };
}

function formatTime(iso: string | null): string | null {
  return iso ? localDateAndTime(iso).time : null;
}

/** Lowest number in a fee-inclusive range string, as the advance/starting
 * price. "FREE"/null -> null. */
function parseAdvancePrice(priceRange: string | null): number | null {
  if (!priceRange || /free/i.test(priceRange)) return null;
  const nums = priceRange.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  return Math.min(...nums.map((n) => parseFloat(n)));
}

// Event-type labels for listings that arrive without a band lineup, matched
// against the title in order (first hit wins). Anything unrecognized falls back
// to a generic "Event" so it's still visibly flagged as a non-show in review.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/private event/i, "Private Event"],
  [/record (sale|fair|show|swap)|vinyl (sale|fair)/i, "Record Sale"],
  [/\bmeet-?up\b/i, "Meetup"],
  [/\bjam\b/i, "Jam"],
  [/\bfest(ival)?\b/i, "Festival"],
  [/\bcomedy\b|stand-?up/i, "Comedy"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
  [/\bmarket\b|\bpop-?up\b/i, "Market"],
  [/\bworkshop\b|\bclass\b/i, "Workshop"],
];

function classifyEventType(title: string): string {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return "Event";
}

function parseEvent(event: HookEvent): ScrapedShow | null {
  if (event.canceledAt) return null; // canceled — drop it

  const performers = Array.isArray(event.performers) ? event.performers : [];
  const names = performers.map((p) => p.name?.trim()).filter(Boolean) as string[];

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  let tag: string | null;

  if (names.length > 0) {
    // A normal show: prefer a "headline" act as the headliner, falling back to
    // the first listed performer (some bills, e.g. festivals, tag everyone
    // "support"). No tag — it's an ordinary music listing.
    headliner =
      performers.find((p) => p.actType === "headline")?.name?.trim() || names[0];
    supporting = names.filter((n) => n !== headliner);
    allBands = [headliner, ...supporting];
    tag = null;
  } else {
    // No lineup: keep it, but label what kind of event it is. The title stands
    // in as the sole "band" so the show has a display name and queues for
    // review (rather than looking auto-importable with an empty lineup).
    const title = event.title?.trim();
    if (!title) return null; // nothing to show
    headliner = title;
    supporting = [];
    allBands = [title];
    tag = classifyEventType(title);
  }

  // startTime is the show; date follows it (same calendar day as doors).
  const anchor = event.startTime || event.doorTime;
  const date = anchor ? localDateAndTime(anchor).date : null;

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: event.image || null,
    ticketUrl: event.publicTicketingUrl || event.venuePermalink || null,
    doorsTime: formatTime(event.doorTime),
    musicTime: formatTime(event.startTime),
    advancePrice: parseAdvancePrice(event.priceRange),
    dosPrice: null,
    sourceUrl: event.venuePermalink || EVENTS_URL,
    tag,
  };
}

export async function scrapeHookAndLadder(): Promise<ScrapedShow[]> {
  const res = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `The Hook and Ladder request failed (${res.status} ${res.statusText})`,
    );
  }

  const html = await res.text();
  const m = ISLAND_RE.exec(html);
  if (!m) {
    throw new Error(
      "The Hook and Ladder: EventsBrowser island props not found on the events page",
    );
  }

  let props: { events?: unknown };
  try {
    props = JSON.parse(decodeHtmlAttr(m[1]));
  } catch {
    throw new Error("The Hook and Ladder: could not parse EventsBrowser props");
  }

  const events = unwrapAstro(props.events);
  if (!Array.isArray(events)) {
    throw new Error("The Hook and Ladder: events prop was not an array");
  }

  return (events as HookEvent[])
    .map(parseEvent)
    .filter((s): s is ScrapedShow => s !== null);
}
