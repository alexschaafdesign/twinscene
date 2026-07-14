// Shared helpers for venues that sell through Dice.fm.
//
// Squarespace sites embed the Dice "event list" widget, which reads a venue's
// events from the Dice partner API. We call that same API directly and map the
// JSON into ScrapedShow[]. Some venues expose the widget's config (apiKey +
// filters) on their page (see zhora.ts); others just link out to Dice per show
// (see cloudland.ts) and reuse the shared key below with a venue-name filter.

import type { ScrapedShow } from "./types";

// The key the Squarespace ⇢ Dice event-list widget embeds ship with. It isn't
// venue-scoped — it queries any venue by name — so venues without an on-page
// widget config can reuse it. If Dice ever rotates it, update it here.
export const DICE_WIDGET_API_KEY = "nJgJNUHjJM4Yuzmwo4LIe7nu1JDqGqnl8icHUeC9";

const DICE_API = "https://partners-endpoint.dice.fm/api/v2/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// Lineup rows like "Doors open" are logistics, not acts.
const DOORS_RE = /doors?\b/i;

// Minimal shape of a Dice event we consume (the API returns far more).
export type DiceEvent = {
  name?: string;
  date?: string; // ISO instant in UTC
  timezone?: string;
  status?: string; // "on-sale" | "cancelled" | …
  type?: string; // "event" | "linkout"
  url?: string; // dice.fm ticket link
  external_url?: string | null; // off-Dice link for linkout events
  images?: string[];
  lineup?: { details?: string; time?: string }[];
  ticket_types?: { price?: { face_value?: number } }[];
  venues?: { name?: string }[];
};

/** UTC ISO instant → "YYYY-MM-DD" calendar date in the venue's timezone. */
function localDate(iso: string | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Clean act names from the lineup. Dice lists them support-first with a "Doors
 * open" logistics row, so drop that row and reverse to get headliner-first.
 */
function lineupBands(lineup: DiceEvent["lineup"]): string[] {
  if (!lineup) return [];
  const acts = lineup
    .map((l) => (l.details ?? "").trim())
    .filter((d) => d && !DOORS_RE.test(d));
  return acts.reverse();
}

/** Fallback when a show has no usable lineup: split the marquee title. */
function parseNameBands(name: string): string[] {
  return name
    .split(/\s*,\s*|\s*&\s*|\s+w\/\s+|\s+with\s+/i)
    .map((s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim()) // drop trailing "(WI)"
    .filter(Boolean);
}

/** Doors time from the lineup, normalised to pilllar's "7:30pm" shape. */
function doorsTime(lineup: DiceEvent["lineup"]): string | null {
  const row = lineup?.find((l) => DOORS_RE.test(l.details ?? ""));
  const t = row?.time?.trim();
  return t ? t.replace(/\s+/g, "").toLowerCase() : null;
}

/** Lowest ticket face value (Dice prices are in cents) as dollars. */
function faceValueDollars(tt: DiceEvent["ticket_types"]): number | null {
  if (!tt) return null;
  const cents = tt
    .map((t) => t.price?.face_value)
    .filter((v): v is number => typeof v === "number");
  return cents.length ? Math.min(...cents) / 100 : null;
}

/** Map one Dice event to a ScrapedShow. `fallbackVenue` is used if the event
 *  carries no venue name of its own. */
function mapDiceEvent(
  e: DiceEvent,
  fallbackVenue: string,
  sourceUrl: string,
): ScrapedShow {
  const tz = e.timezone || "America/Chicago";
  const name = (e.name ?? "").trim();

  let bands = lineupBands(e.lineup);
  if (bands.length === 0) bands = parseNameBands(name);

  // Keep a title even for band-less events so import never sees an empty one.
  const headliner = bands[0] ?? (name || null);
  const isLinkout = e.type === "linkout";
  const ticketUrl =
    (isLinkout && e.external_url ? e.external_url : e.url) ?? null;

  return {
    venue: e.venues?.[0]?.name?.trim() || fallbackVenue,
    date: localDate(e.date, tz),
    headliner,
    supporting: bands.slice(1),
    allBands: bands,
    flyerUrl: e.images?.[0] ?? null,
    ticketUrl,
    doorsTime: doorsTime(e.lineup),
    musicTime: null,
    advancePrice: faceValueDollars(e.ticket_types),
    dosPrice: null,
    sourceUrl,
  };
}

// The config object a Squarespace page passes to DiceEventListWidget.create({…}).
// Venues that embed the widget carry their apiKey + venue/promoter filters here,
// so a scraper can read them off the page rather than hardcoding them (and thus
// follows the venue if they re-point the widget). See zhora.ts / undergroundmusic.ts.
export type DiceWidgetConfig = {
  apiKey: string;
  venues: string[];
  promoters: string[];
};

/** Pull the DiceEventListWidget.create({…}) config out of an events page.
 *  `label` names the venue for error messages. */
export function extractDiceWidgetConfig(
  html: string,
  label: string,
): DiceWidgetConfig {
  const m = html.match(/DiceEventListWidget\.create\((\{[\s\S]*?\})\)/);
  if (!m) {
    throw new Error(`${label}: Dice widget config not found on the events page`);
  }
  // Squarespace may HTML-escape the embedded code block; undo the common ones.
  const json = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(`${label}: could not parse the Dice widget config`);
  }

  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
  if (!apiKey) throw new Error(`${label}: Dice widget config is missing apiKey`);

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    apiKey,
    venues: strList(cfg.venues),
    promoters: strList(cfg.promoters),
  };
}

/**
 * Fetch a venue's upcoming shows from the Dice partner API and map them to
 * ScrapedShow[]. Cancelled events are dropped.
 */
export async function fetchDiceShows(opts: {
  venue: string; // display name + default API venue filter
  apiKey: string;
  sourceUrl: string;
  venues?: string[]; // filter[venues][] (defaults to [venue])
  promoters?: string[]; // filter[promoters][]
}): Promise<ScrapedShow[]> {
  const url = new URL(DICE_API);
  url.searchParams.set("page[size]", "100");
  url.searchParams.set("types", "linkout,event");
  for (const v of opts.venues ?? [opts.venue]) {
    url.searchParams.append("filter[venues][]", v);
  }
  for (const p of opts.promoters ?? []) {
    url.searchParams.append("filter[promoters][]", p);
  }

  const res = await fetch(url, {
    headers: { "x-api-key": opts.apiKey, "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Dice API failed for ${opts.venue} (${res.status} ${res.statusText})`,
    );
  }
  const body = (await res.json()) as { data?: DiceEvent[] };
  return (body.data ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => mapDiceEvent(e, opts.venue, opts.sourceUrl));
}
