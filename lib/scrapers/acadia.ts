// Scraper for Acadia Cafe's events calendar.
//
// https://www.acadiacafe.com/events is a Wix site, and its events page stacks
// THREE different event apps — most of which are dead ends worth documenting so
// nobody re-derives this the hard way:
//   - "Wix Events & Tickets": real API, but the venue abandoned it — 11 events,
//     all ended, newest from 2021, plus five "EVENT A–E" placeholders.
//   - "Ticket Spot" (geteventviewer.com): returns only generic demo events.
//   - "Events Calendar" (eventscalendar.co): the live one. It's the widget that
//     opens each show in a modal without changing the URL.
//
// The Events Calendar widget doesn't store the current shows itself — it
// aggregates them from an external feed the venue connected (here: a Google
// Calendar named "Acadia Booking"; an Eventbrite account is also linked but
// currently empty). So getting the live list is a three-step chain, all public
// (no auth), reverse-engineered from the widget's embed bundle:
//
//   1. GET /_api/v1/access-tokens on the site — returns a fresh per-app Wix
//      `instance` token for every installed app, keyed by appDefId. We want the
//      Events Calendar app's (APP_DEF_ID below).
//   2. POST inffuse's context endpoint (the eventscalendar backend platform)
//      with that instance + the widget's Wix component id (COMP_ID). Wix resolves
//      the site/user from the instance; the component id selects *this* calendar
//      ("project"). The response carries the inffuse user/project ids plus the
//      list of connected external accounts (provider type + calendar ids).
//   3. For each connected calendar, GET the eventscalendar broker's
//      `/api/<provider>/events` with the user/project/calendar ids and a
//      from/to window (epoch millis) — that returns the actual events.
//
// COMP_ID is the one venue-specific constant we hardcode (like other scrapers'
// venue ids); everything downstream — inffuse user/project, the Google calendar
// id, even which providers are connected — is read from the step-2 response, so
// this keeps working if the venue reconnects a feed or swaps calendars. We loop
// every connected account generically rather than hardcoding "google", so a
// future switch to the (already-linked) Eventbrite feed needs no code change.
//
// The Google feed gives a title, a free-text description, and start/end times
// (both epoch millis and an ISO `start_time` already in venue-local offset), but
// no flyer image, ticket link, or structured price — so those are all null here.
// The `start_time` date is used directly for the show date, and startHour/Minute
// for the music time; doors aren't exposed. Titles pack the whole bill into one
// string ("Hill of Crosses/Make Me Sick/ Sweet Land", "Sophia Brand/David
// Singley"), split the same way as the other title-based scrapers.
//
// This feed also carries recurring non-band fixtures — a weekly open mic and
// "Taco Tuesday" DJ night, plus the occasional "Tequila Thursday"/trivia/bingo.
// Rather than drop those (which would make them silently vanish), they're kept
// and labeled with an event-type `tag` so they land in the import review clearly
// marked, the same way hookandladder.ts handles its non-shows. A tagged row
// carries its raw title as the sole "band" so it queues for review instead of
// looking auto-importable. Classification is by known fixture name only — not a
// blanket "DJ" match — because plenty of real booked shows here are DJ sets
// (e.g. "DJ OG Carter", "Meiday/DJ Killa Beat"), which must stay untagged shows.
// The one thing dropped outright is a bare "CLOSED" day marker: that's the venue
// blocking off a date, not an event (analogous to a canceled show).

import type { ScrapedShow } from "./types";

const VENUE = "Acadia Cafe";
const EVENTS_URL = "https://www.acadiacafe.com/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// The Events Calendar (eventscalendar.co) Wix app, and its component instance on
// Acadia's events page. The appDefId is constant across every eventscalendar
// site; the compId is specific to Acadia's widget.
const APP_DEF_ID = "133bb11e-b3db-7e3b-49bc-8aa16af72cac";
const COMP_ID = "comp-kr152iu7";

const ACCESS_TOKENS_URL = "https://www.acadiacafe.com/_api/v1/access-tokens";
const INFFUSE_CONTEXT_URL =
  "https://inffuse-platform.appspot.com/js/v0.1/calendar/data";
const BROKER_URL = "https://broker.eventscalendar.co";

// How far ahead to pull. The feed honors the from/to window and returns the
// whole range in one response (no pagination needed at this size).
const WINDOW_DAYS = 180;

// Recurring non-band fixtures the venue puts on the same calendar, matched
// against the title in order (first hit wins). Deliberately specific — matching
// fixture names, not broad keywords — so a real act isn't mislabeled. A match
// tags the listing as a non-show for review rather than dropping it.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/open mic/i, "Open Mic"],
  [/taco tuesday/i, "Taco Tuesday"],
  [/tequila thursday/i, "Tequila Thursday"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
  [/\bkaraoke\b/i, "Karaoke"],
];

// A bare "CLOSED"/"CLOSED Happy 4th" day marker — the venue blocking off a date,
// not an event. Dropped outright (nothing to review).
const CLOSED_RE = /^closed\b/i;

/** Event-type label for a non-band fixture, or null for an ordinary show. */
function classifyEventType(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

type AccessTokens = {
  apps: Record<string, { instance: string }>;
};

type InffuseContext = {
  user: { meta: { id: string } };
  project: {
    meta: { id: string };
    data: {
      external_accounts?: {
        type?: string;
        calendars?: { id: string }[];
      }[];
    };
  };
};

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start_time?: string; // ISO 8601, venue-local offset
  start?: number; // epoch millis
  startHour?: number;
  startMinutes?: number;
};

/** Split a show title into individual act names, mirroring the other
 * title-based scrapers: "w/"/"with" marks the headliner/support boundary, then
 * each side splits on slashes, commas, ampersands, plus, "x", and feat. */
function splitBands(rawTitle: string): string[] {
  const title = rawTitle.trim();
  const sides = title.split(/\s+w\/\s*|\s+with\s+/i);
  const names = sides.flatMap((side) =>
    // The Oxford-comma alternatives must come before the bare comma one: for
    // "A, B, & C" the bare comma would otherwise consume ", " right up to the
    // "&", stranding "& C" as its own piece with no leading space left for
    // the "&" alternative to match.
    side.split(
      /\s*,\s*&\s+|\s*,\s*and\s+|\s*\/\/\s*|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+feat\.\s+|\s+ft\.\s+/i,
    ),
  );
  return names
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n));
}

/** startHour/startMinutes (venue-local) -> "7:30pm", matching the other scrapers. */
function formatTime(hour: number | undefined, minute: number | undefined): string | null {
  if (hour === undefined) return null;
  const suffix = hour >= 12 ? "pm" : "am";
  const h = hour % 12 || 12;
  return `${h}:${String(minute ?? 0).padStart(2, "0")}${suffix}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Acadia request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json() as Promise<T>;
}

function parseEvent(event: CalendarEvent): ScrapedShow | null {
  const title = (event.title ?? "").trim();
  if (!title || CLOSED_RE.test(title)) return null; // no title / closed-day marker

  // Prefer the ISO start_time's date (already in venue-local offset); fall back
  // to the epoch-millis start if it's ever missing.
  const date = event.start_time
    ? event.start_time.slice(0, 10)
    : event.start
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Chicago",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(event.start))
      : null;
  if (!date) return null;

  const tag = classifyEventType(title);

  let headliner: string;
  let supporting: string[];
  let allBands: string[];
  if (tag) {
    // A non-band fixture: keep the raw title as the sole "band" so it has a
    // display name and queues for review (rather than getting split into acts
    // and fuzzy-matched against the directory), mirroring hookandladder.ts.
    headliner = title;
    supporting = [];
    allBands = [title];
  } else {
    allBands = splitBands(title);
    if (allBands.length === 0) return null;
    [headliner, ...supporting] = allBands;
  }

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: null,
    ticketUrl: null,
    doorsTime: null,
    musicTime: formatTime(event.startHour, event.startMinutes),
    advancePrice: null,
    dosPrice: null,
    sourceUrl: EVENTS_URL,
    tag,
  };
}

export async function scrapeAcadia(): Promise<ScrapedShow[]> {
  // 1. Fresh Wix instance token for the Events Calendar app.
  const tokens = await fetchJson<AccessTokens>(ACCESS_TOKENS_URL);
  const instance = tokens.apps?.[APP_DEF_ID]?.instance;
  if (!instance) {
    throw new Error("Acadia: Events Calendar app instance token not found");
  }

  // 2. Resolve the inffuse user/project and the connected external feeds.
  const contextUrl = `${INFFUSE_CONTEXT_URL}?${new URLSearchParams({
    instance,
    compId: COMP_ID,
    platform: "wix",
  })}`;
  const ctx = await fetchJson<InffuseContext>(contextUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
  const userId = ctx.user?.meta?.id;
  const projectId = ctx.project?.meta?.id;
  if (!userId || !projectId) {
    throw new Error("Acadia: could not resolve inffuse user/project from context");
  }
  const accounts = ctx.project?.data?.external_accounts ?? [];

  // 3. Pull events from every connected calendar over the upcoming window.
  const now = Date.now();
  const from = now;
  const to = now + WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const events: CalendarEvent[] = [];
  for (const account of accounts) {
    const provider = account.type;
    if (!provider) continue;
    for (const calendar of account.calendars ?? []) {
      const url = `${BROKER_URL}/api/${provider}/events?${new URLSearchParams({
        user: userId,
        project: projectId,
        calendar: calendar.id,
        from: String(from),
        to: String(to),
      })}`;
      const data = await fetchJson<{ events?: CalendarEvent[] }>(url);
      events.push(...(data.events ?? []));
    }
  }

  // A single show can appear on more than one connected calendar; de-dupe by id.
  const byId = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (event.id && !byId.has(event.id)) byId.set(event.id, event);
  }

  return [...byId.values()]
    .map(parseEvent)
    .filter((s): s is ScrapedShow => s !== null);
}
