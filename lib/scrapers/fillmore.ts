// Scraper for The Fillmore Minneapolis (a Live Nation room).
//
// The venue site (fillmoreminneapolis.com/shows) is a client-rendered React
// app — the server HTML has no readable event cards — but it *does* embed one
// `<script type="application/ld+json">` schema.org **MusicEvent** per show, and
// those are populated server-side. So rather than trying to drive the JS app,
// this parses those JSON-LD blocks, which is the whole upcoming calendar in a
// clean, stable shape (name, image, startDate, ticket url).
//
// What the JSON-LD gives us and what it doesn't:
//   - `name` is a single promotional title ("Dimmu Borgir: Grand Serpent
//     Rising Tour US 2026", "93X Presents Poppy - Constantly Nowhere Tour"),
//     NOT a structured headliner/support split. There are no separate opener
//     fields anywhere in the server HTML, so support acts generally can't be
//     recovered — the one exception is a "feat. X" clause inside the title,
//     which we do pull out. parseTitle below strips promoter prefixes and
//     tour/subtitle cruft down to the artist(s).
//   - `startDate` is ISO with a venue-local offset ("2026-07-22T18:00:00-05:00").
//     The wall-clock part is already America/Chicago, so we read date + time
//     straight off the string. The source doesn't distinguish doors from show
//     time; schema.org's startDate is the event start, so it's emitted as
//     musicTime.
//   - No price, no age restriction (age rules come from venue_age_rules if set).
//   - `url` is a Ticketmaster link — used as both ticket link and source link
//     (there's no stable per-event page on the venue's own site to point at).

import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "The Fillmore"; // matches the venues-directory row (slug the-fillmore)
const SHOWS_URL = "https://www.fillmoreminneapolis.com/shows";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// Local radio stations / promoters that prefix a bill as "<promoter> Presents
// <artist> …". Stripped so the artist, not the sponsor, becomes the headliner.
// Matched only as a leading "<promoter> Presents " with a following artist —
// note this is deliberately distinct from an artist's own "<Artist> Presents:
// <show>" framing (e.g. "Ravyn Lenae Presents: Blue Island"), which has a colon
// and is handled as an ordinary subtitle split, keeping the artist intact.
const PROMOTER_PREFIXES = [
  "93X",
  "89.3 The Current",
  "The Current",
  "Cities 97",
  "GO 96.3",
  "Go 95.3",
  "KDWB",
  "K102",
  "Radio K",
];

const PROMOTER_PREFIX_RE = new RegExp(
  `^(?:${PROMOTER_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+presents\\s+(?=\\S)`,
  "i",
);

// The promotional title carries a tour/subtitle after a dash or colon
// ("Jack Harlow - Monica Tour", "Masego: Fix Your Face Tour"). Split on the
// FIRST such separator and keep the part before it as the artist portion.
const SUBTITLE_SEP_RE = /\s+[–—-]\s+|:\s+/;

// A "feat./featuring/ft." clause names a real featured act — pull it out as a
// supporting act rather than letting it dangle on the headliner.
const FEAT_RE = /\s+(?:feat\.?|featuring|ft\.?)\s+(.+)$/i;

/** Collapse whitespace / stray non-breaking spaces. */
function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Split a co-headline artist portion ("Arch Enemy & The Black Dahlia Murder")
 * into individual acts. Known multi-part names ("Earth, Wind & Fire") are
 * protected first so the "&" inside them can't fragment them. */
function splitActs(raw: string): string[] {
  const { text: protectedText, restore } = protectKnownNames(clean(raw));
  return protectedText
    .split(/\s+&\s+|\s+\+\s+|\s+x\s+/)
    .map((s) => restore(s).trim())
    .filter((s) => s && !/^tba$/i.test(s) && !/^tbd$/i.test(s));
}

type ParsedTitle = { headliner: string; supporting: string[]; allBands: string[] };

/** Reduce a promotional title to its artist lineup. Best-effort: titles that
 * don't fit the "artist(s) [- tour]" shape (anniversary framings like "10 Years
 * of 6LACK Tour", themed nights like "Bop To The Top") fall through with the
 * whole cleaned title as the headliner, which the import review then flags. */
function parseTitle(rawName: string): ParsedTitle {
  let name = clean(rawName);

  // 1. Drop a leading "<radio/promoter> Presents " sponsor prefix.
  name = name.replace(PROMOTER_PREFIX_RE, "");

  // 2. Peel off a "feat. X" clause as a real supporting act, before splitting
  //    off the tour subtitle (feat. clauses sit at the very end).
  const featured: string[] = [];
  const featMatch = FEAT_RE.exec(name);
  if (featMatch) {
    featured.push(...splitActs(featMatch[1]));
    name = name.slice(0, featMatch.index).trim();
  }

  // 3. Strip a parenthetical aside ("(Steve Jones, Paul Cook, Glen Matlock)")
  //    — band-member listings / notes, not part of the act's name.
  name = name.replace(/\s*\([^)]*\)/g, " ").trim();

  // 4. Keep only the part before the first tour/subtitle separator.
  const artistPortion = name.split(SUBTITLE_SEP_RE)[0].trim();

  // 5. A trailing "Presents" survives an "<Artist> Presents: <show>" split —
  //    e.g. "Ravyn Lenae Presents" → "Ravyn Lenae".
  const cleanedArtist = artistPortion.replace(/\s+presents$/i, "").trim();

  const headliners = splitActs(cleanedArtist);
  const headliner = headliners[0] ?? clean(rawName);
  const supporting = [...headliners.slice(1), ...featured];

  return {
    headliner,
    supporting,
    allBands: [headliner, ...supporting],
  };
}

/** "2026-07-22T18:00:00-05:00" -> "2026-07-22" (the wall-clock date, already
 * venue-local). */
function datePart(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}

/** "2026-07-22T18:00:00-05:00" -> "6:00pm" (venue-local wall-clock time). */
function timePart(iso: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${suffix}`;
}

type MusicEvent = {
  "@type"?: string;
  name?: string;
  image?: string;
  startDate?: string;
  url?: string;
  location?: { name?: string };
};

/** Pull every JSON-LD MusicEvent block out of the shows page HTML. */
function extractMusicEvents(html: string): MusicEvent[] {
  const events: MusicEvent[] = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // a non-JSON or malformed block — skip it, don't fail the run
    }
    // A block may be a single object or an array (or a @graph wrapper).
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown })["@graph"])
        ? ((parsed as { "@graph": unknown[] })["@graph"])
        : [parsed];
    for (const c of candidates) {
      if (c && typeof c === "object" && (c as MusicEvent)["@type"] === "MusicEvent") {
        events.push(c as MusicEvent);
      }
    }
  }
  return events;
}

export async function scrapeFillmore(): Promise<ScrapedShow[]> {
  const res = await fetch(SHOWS_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Fillmore request failed (${res.status} ${res.statusText})`);
  }
  const html = await res.text();
  const events = extractMusicEvents(html);

  const shows: ScrapedShow[] = [];
  for (const event of events) {
    const name = event.name ? clean(event.name) : "";
    const date = event.startDate ? datePart(event.startDate) : null;
    if (!name || !date) continue; // nothing usable without a title + date

    const { headliner, supporting, allBands } = parseTitle(name);
    const ticketUrl = event.url ?? null;

    shows.push({
      venue: VENUE,
      date,
      headliner,
      supporting,
      allBands,
      flyerUrl: event.image ?? null,
      ticketUrl,
      doorsTime: null,
      // schema.org startDate is the event start; the source doesn't split out
      // doors, so this is the only time we have.
      musicTime: event.startDate ? timePart(event.startDate) : null,
      advancePrice: null,
      dosPrice: null,
      // No stable per-event page on the venue's own site — the Ticketmaster
      // link is the best source pointer we have.
      sourceUrl: ticketUrl ?? SHOWS_URL,
    });
  }

  return shows;
}
