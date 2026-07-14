// Scraper for Flying V's events calendar.
//
// https://flyingvmusic.com/ is a GoDaddy Website Builder ("GoCentral") site. Its
// homepage embeds a CALENDAR widget (`@widget/CALENDAR/bs-calendar`) whose props
// carry an `icalURL` — the venue publishes its real show calendar as a public
// Google Calendar and syncs the widget to it, rather than hand-entering events
// into the widget itself (the widget's own `manualEvents` is just GoDaddy's demo
// placeholder content). That ICS feed, not the page HTML, is the real data
// source — found by pulling the page's compiled section bundle (a
// `img1.wsimg.com/blobby/.../script.js` referenced from the homepage) and
// regexing the CALENDAR widget's JSON props out of it. The feed URL is
// hardcoded below rather than re-derived on every scrape (mirrors other
// scrapers hardcoding a venue's feed/widget id): it only breaks if the venue
// reconnects a different calendar, which is rare and easy to notice/update.
//
// The feed is a real, hand-maintained venue calendar — RRULE recurring
// bookings, one RECURRENCE-ID override with a corrupted date, closures, and
// non-band listings mixed in with shows — rather than a clean structured API,
// so this parses free text instead of trusting fielded data:
//   - SUMMARY is the event title, often with a trailing price ("Wysteria $10")
//     or a slash-separated lineup ("Gnaw / Primitive Rage *FREE Show*").
//   - DESCRIPTION, when present, is typically "Band, Band, Band\nDoors 6:30pm,
//     Music 7:00pm, $10". The nearest non-blank line above the Doors/Show/
//     Music/Noise line is treated as the lineup, unless it looks like a
//     schedule fragment ("8:40 Flowers 4 Guilt") or a parenthetical note
//     ("(times are approximate)") — those festival-style minute-by-minute
//     schedules aren't reduced to a lineup; the show falls back to its title.
//   - Recurring events are expanded with node-ical's `expandRecurringEvent`
//     (handles RRULE + RECURRENCE-ID overrides). Flying V's calendar tooling
//     has written at least one RECURRENCE-ID that doesn't match any real
//     occurrence of its base rule, which node-ical can't reconcile either — a
//     stale override description can leak onto the wrong month for that one
//     series. Not worth working around a data bug in the venue's own tooling;
//     it'll surface flagged in review like any other lineup mismatch.
//
// Listings that are clearly not band shows (private events/rehearsals,
// markets, meetings, recitals, comedy) are tagged with an event-type label
// rather than dropped, mirroring hookandladder.ts/acadia.ts — except a bare
// "Closed"/"Closed for X" marker, which (like Acadia's CLOSED_RE) is the venue
// blocking off a date, not an event, so it's dropped outright. Canceled shows
// (title prefixed "CANCELED-"/"CANCELLED!!"/etc. — a manual convention here,
// since the ICS STATUS field stays CONFIRMED) are also dropped.
//
// No flyer image is exposed by this feed (always null here); a ticket URL is
// pulled from the description on the rare event that includes one.

import ical from "node-ical";
import type { ScrapedShow } from "./types";

const VENUE = "Flying V";
const EVENTS_URL = "https://flyingvmusic.com/";
const TIMEZONE = "America/Chicago";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// The venue's public Google Calendar feed, wired to the CALENDAR widget on
// flyingvmusic.com (see file header for how this was found).
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/68c68996e952062b123d16fab31544df64ba2ab944c79757edf3fd1cb967e300%40group.calendar.google.com/public/basic.ics";

// How far ahead to pull.
const WINDOW_DAYS = 180;

// A bare "Closed"/"Closed for Private Event" marker — the venue blocking off a
// date, not a public event. Dropped outright (nothing to review), mirroring
// acadia.ts's CLOSED_RE.
const CLOSED_RE = /^closed\b/i;

// Canceled shows are marked by convention in the title (ICS STATUS stays
// CONFIRMED), e.g. "CANCELED-Manny's Mixed Punk Show", "CANCELLED!! Wysteria".
const CANCELED_RE = /^cancell?ed\b/i;

// Listings with no band lineup, matched against the title in order (first hit
// wins). Unmatched falls through to description/title-based lineup parsing.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\bmarket\b/i, "Market"],
  [/\bcomedy\b|stand-?up/i, "Comedy"],
  [/\brecital\b/i, "Recital"],
  [/\brehearsal\b/i, "Rehearsal"],
  [/city council meeting|\bmeeting\b/i, "Meeting"],
  [/private (event|show|recording)/i, "Private Event"],
];

function classifyEventType(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

/** Split a title/lineup line into individual act names: "w/"/"with" marks the
 * headliner/support boundary, then each side splits on slashes, commas,
 * ampersands, plus, "x", and feat — mirrors the other title-based scrapers
 * (e.g. acadia.ts). */
function splitBands(raw: string): string[] {
  const sides = raw.trim().split(/\s+w\/\s*|\s+with\s+/i);
  const names = sides.flatMap((side) =>
    side.split(
      /\s*\/\/\s*|\s*\/\s*|\s+&\s+|\s*,\s*|\s+and\s+|\s+x\s+|\s+\+\s+|\s+featuring\s+|\s+feat\.\s+|\s+ft\.\s+/i,
    ),
  );
  return names.map((n) => n.trim()).filter(Boolean);
}

/** Strip a trailing price/free marker off a title, e.g. "Wysteria $10" ->
 * "Wysteria", "Gnaw / Primitive Rage *FREE Show*" -> "Gnaw / Primitive Rage". */
function stripPriceSuffix(title: string): string {
  return title
    .replace(/\$.*$/, "")
    .replace(/\*[^*]+\*\s*$/, "")
    .replace(/[,\-\s]+$/, "")
    .trim();
}

/** Lowest dollar amount mentioned, or null for free/TBA/unspecified. */
function parsePrice(text: string): number | null {
  if (/\bfree\b|\btba\b/i.test(text)) return null;
  const nums = text.match(/\$\s*\d+(?:\.\d{1,2})?/g);
  if (!nums) return null;
  return Math.min(...nums.map((n) => parseFloat(n.replace(/[^0-9.]/g, ""))));
}

/** "6:30pm" / "1pm" / "6:00" -> "6:30pm". am/pm is assumed "pm" when omitted —
 * every doors/music time on this calendar is an afternoon or evening one. */
function normalizeTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])?/i.exec(raw);
  if (!m) return null;
  const hour = parseInt(m[1], 10) % 12 || 12;
  const minute = m[2] ?? "00";
  const suffix = m[3] ? `${m[3].toLowerCase()}m` : "pm";
  return `${hour}:${minute}${suffix}`;
}

const DOORS_RE = /\bdoors?\s*[:.]?\s*(\d{1,2}(?::\d{2})?\s*[ap]?\.?m?\.?)/i;
const STARTTIME_RE = /\b(?:music|show|noise)\s*[:.]?\s*(\d{1,2}(?::\d{2})?\s*[ap]?\.?m?\.?)/i;
const LOGISTICS_LINE_RE = /\bdoors?\b/i;
// A schedule fragment ("8:40 Flowers 4 Guilt") or a parenthetical aside
// ("(times are approximate)") — not a lineup, even though it sits right above
// the Doors/Show line in a festival's minute-by-minute description. Requires
// the H:MM colon (not just a leading digit) so a band name that happens to
// start with a number, e.g. "12 Gauge Autopsy", isn't mistaken for one.
const NOT_LINEUP_RE = /^\(|^\d{1,2}:\d{2}\s/;

type Lineup = {
  allBands: string[];
  doorsTime: string | null;
  musicTime: string | null;
  price: number | null;
};

/** Nearest non-blank line above the logistics line, skipping blank separator
 * lines but not other content — so a lineup line two blank lines above
 * "Doors ..." is still found, while a schedule/note fragment immediately
 * above it isn't mistaken for one. */
function findLineupLine(lines: string[], logisticsIndex: number): string | null {
  let i = logisticsIndex - 1;
  while (i >= 0 && lines[i] === "") i--;
  if (i < 0) return null;
  const candidate = lines[i];
  return NOT_LINEUP_RE.test(candidate) ? null : candidate;
}

/** Look for a "Doors ..., Music ..., $..." line in the description and pull
 * the lineup, times, and price around it. Returns null if there's no usable
 * lineup line — a bare blurb, a festival-style schedule, or no description. */
function parseLineup(description: string | null): Lineup | null {
  if (!description) return null;
  const lines = description.split("\n").map((l) => l.trim());
  const logisticsIndex = lines.findIndex((l) => LOGISTICS_LINE_RE.test(l));
  if (logisticsIndex <= 0) return null; // no logistics line, or it's the first line

  const lineupLine = findLineupLine(lines, logisticsIndex);
  if (!lineupLine) return null;
  const allBands = splitBands(lineupLine);
  if (allBands.length === 0) return null;

  const logisticsLine = lines[logisticsIndex];
  return {
    allBands,
    doorsTime: normalizeTime(DOORS_RE.exec(logisticsLine)?.[1]),
    musicTime: normalizeTime(STARTTIME_RE.exec(logisticsLine)?.[1]),
    price: parsePrice(logisticsLine),
  };
}

/** node-ical returns ICS text fields as plain strings, except when the source
 * line carries parameters (e.g. a language tag), in which case it's
 * `{val, params}` — handle both. */
function textValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val);
  return "";
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const URL_RE = /https?:\/\/\S+/;

function parseInstance(instance: ical.EventInstance): ScrapedShow | null {
  const title = textValue(instance.event.summary).trim();
  if (!title || CLOSED_RE.test(title) || CANCELED_RE.test(title)) return null;

  const date = localDate(instance.start);
  const description = textValue(instance.event.description).trim() || null;
  const ticketUrl = description ? URL_RE.exec(description)?.[0] ?? null : null;

  const tag = classifyEventType(title);
  if (tag) {
    const name = stripPriceSuffix(title) || title;
    return {
      venue: VENUE,
      date,
      headliner: name,
      supporting: [],
      allBands: [name],
      flyerUrl: null,
      ticketUrl,
      doorsTime: null,
      musicTime: null,
      advancePrice: parsePrice(title),
      dosPrice: null,
      sourceUrl: EVENTS_URL,
      tag,
    };
  }

  const lineup = parseLineup(description);
  const allBands = lineup?.allBands.length ? lineup.allBands : splitBands(stripPriceSuffix(title));
  if (allBands.length === 0) return null;
  const [headliner, ...supporting] = allBands;

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: null,
    ticketUrl,
    doorsTime: lineup?.doorsTime ?? null,
    musicTime: lineup?.musicTime ?? null,
    advancePrice: lineup?.price ?? parsePrice(title),
    dosPrice: null,
    sourceUrl: EVENTS_URL,
  };
}

export async function scrapeFlyingV(): Promise<ScrapedShow[]> {
  const res = await fetch(ICAL_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Flying V calendar feed request failed (${res.status} ${res.statusText})`);
  }

  const events = ical.parseICS(await res.text());
  const now = new Date();
  const future = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const instances = Object.values(events)
    .filter((e): e is ical.VEvent => e != null && e.type === "VEVENT")
    .flatMap((event) => ical.expandRecurringEvent(event, { from: now, to: future }));

  return instances.map(parseInstance).filter((s): s is ScrapedShow => s !== null);
}
