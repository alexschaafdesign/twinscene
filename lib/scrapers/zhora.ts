// Scraper for Zhora Darling's events page.
//
// https://www.zhoradarling.com/events is a Squarespace page whose event list is
// rendered client-side by the Dice.fm widget — the server HTML has no event
// markup. What the HTML *does* carry is the widget's init config (a partner
// apiKey plus venue/promoter filters). So we read that config off the page, then
// call the same Dice partner API the widget uses and map its JSON into
// ScrapedShow[]. Reading the config from the page (rather than hardcoding the
// key) means the scraper follows the venue if they re-point the widget.

import type { ScrapedShow } from "./types";

const EVENTS_URL = "https://www.zhoradarling.com/events";
const VENUE = "Zhora Darling";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
const DICE_API = "https://partners-endpoint.dice.fm/api/v2/events";

// The config passed to DiceEventListWidget.create({...}) in the page.
type DiceConfig = {
  apiKey: string;
  venues: string[];
  promoters: string[];
};

// Minimal shape of a Dice event we consume (the API returns far more).
type DiceEvent = {
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
};

// Lineup rows like "Doors open" are logistics, not acts.
const DOORS_RE = /doors?\b/i;

/** Pull the DiceEventListWidget.create({...}) config object out of the page. */
function extractDiceConfig(html: string): DiceConfig {
  const m = html.match(/DiceEventListWidget\.create\((\{[\s\S]*?\})\)/);
  if (!m) {
    throw new Error("Zhora: Dice widget config not found on the events page");
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
    throw new Error("Zhora: could not parse the Dice widget config");
  }

  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
  if (!apiKey) throw new Error("Zhora: Dice widget config is missing apiKey");

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return { apiKey, venues: strList(cfg.venues), promoters: strList(cfg.promoters) };
}

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

export async function scrapeZhora(): Promise<ScrapedShow[]> {
  const pageRes = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(
      `Zhora events page failed (${pageRes.status} ${pageRes.statusText})`,
    );
  }
  const cfg = extractDiceConfig(await pageRes.text());

  const url = new URL(DICE_API);
  url.searchParams.set("page[size]", "100");
  url.searchParams.set("types", "linkout,event");
  for (const v of cfg.venues) url.searchParams.append("filter[venues][]", v);
  for (const p of cfg.promoters) url.searchParams.append("filter[promoters][]", p);

  const apiRes = await fetch(url, {
    headers: { "x-api-key": cfg.apiKey, "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!apiRes.ok) {
    throw new Error(
      `Zhora Dice API failed (${apiRes.status} ${apiRes.statusText})`,
    );
  }
  const body = (await apiRes.json()) as { data?: DiceEvent[] };
  const events = body.data ?? [];

  const shows: ScrapedShow[] = [];
  for (const e of events) {
    if (e.status === "cancelled") continue;

    const tz = e.timezone || "America/Chicago";
    const name = (e.name ?? "").trim();

    let bands = lineupBands(e.lineup);
    if (bands.length === 0) bands = parseNameBands(name);

    // Keep a title even for band-less events so import never sees an empty one.
    const headliner = bands[0] ?? (name || null);
    const isLinkout = e.type === "linkout";
    const ticketUrl =
      (isLinkout && e.external_url ? e.external_url : e.url) ?? null;

    shows.push({
      venue: VENUE,
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
      sourceUrl: EVENTS_URL,
    });
  }

  return shows;
}
