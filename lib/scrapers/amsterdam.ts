// Scraper for Amsterdam Bar & Hall (St. Paul).
//
// The events site (events.amsterdambarandhall.com) is WordPress running the
// RockHouse ("RHP") events plugin, and the upcoming-events widget is fully
// server-rendered on one page — every upcoming show, from this month out to
// whenever the last one is booked — so a single request gets the whole
// calendar. We parse the `.rhpSingleEvent` cards with cheerio, mirroring the
// First Avenue scraper's HTML approach.
//
// The list cards carry almost everything: title (with the bill packed into one
// string, "Headliner w/ A, B & C"), age restriction, and door/show times. The
// one thing they lack is the flyer — that lives only on each event's own page,
// in the `twitter:image` meta tag (with a cleaner, genre-annotated blurb in
// `twitter:description`). So, like firstavenue.ts fetching event pages for
// times, we fetch each event page once (bounded concurrency) for the flyer +
// description. A detail fetch failing is best-effort — the show still imports,
// just without a flyer/description.
//
// Dates: a card's `#eventDate` reads "Wed, Jul 22" — month + day but no year.
// The year comes from the `.rhp-events-list-separator-month` header ("July
// 2026", "March 2027") that precedes each month's cards, so we walk the month
// headers and cards together in document order (like First Avenue walks its
// day anchors), stamping each card with the current header's year. This gets
// the Dec→Jan / year rollover right.
//
// NOTE ON DUPLICATES: First Avenue *presents* many Amsterdam shows and lists
// them on its own calendar too. First Avenue's scraper skips venues owned
// elsewhere (VENUES_OWNED_ELSEWHERE in firstavenue.ts) — "Amsterdam Bar & Hall"
// is in that set, so this scraper is the sole source for the room and First
// Avenue won't import a duplicate.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";
import { protectKnownNames } from "./knownActNames";

const VENUE = "Amsterdam Bar & Hall"; // resolves to the "Amsterdam" directory row via substring match
const EVENTS_URL = "https://events.amsterdambarandhall.com/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// Each show's flyer/description needs one more request (its event page). Cap
// how many are in flight so we don't hammer the site with ~50 at once.
const DETAIL_CONCURRENCY = 6;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Recurring non-band events booked into the same calendar as shows. Kept short
// and specific (like whitesquirrel.ts) so it can't swallow a real band name —
// anything unmatched is left as an ordinary show and, if it's not really a
// band, harmlessly fails to match a directory band and sits in the review
// queue rather than auto-importing a fake band.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/^the moth\b/i, "Storytelling"],
  [/\bdance party\b/i, "Dance Party"],
  [/\btrivia\b/i, "Trivia"],
  [/\bbingo\b/i, "Bingo"],
  [/\bkaraoke\b/i, "Karaoke"],
  [/\bcomedy\b|stand-?up/i, "Comedy"],
];

function classifyEventType(title: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(title)) return label;
  }
  return null;
}

/** Collapse whitespace / stray non-breaking spaces. */
function clean(text: string): string {
  return (text || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Split a bill string ("Headliner w/ A, B & C") into individual band names.
 * Mirrors whitesquirrel.ts's splitBands: "w/"/"w." marks the headliner/support
 * boundary, and commas/&/and/+/featuring split within each side. Drops TBA/TBD
 * and trailing "& more" filler. Text is assumed already entity-decoded (cheerio
 * decodes it off the DOM). */
function splitBands(title: string): string[] {
  const { text: protectedText, restore } = protectKnownNames(clean(title));
  const sides = protectedText.split(/\s+w\/\s+|\s+w\.\s+/i);
  const names = sides.flatMap((side) =>
    // Oxford-comma alternatives before the bare comma (see whitesquirrel.ts).
    side.split(/\s*,\s*&\s+|\s*,\s*and\s+|\s*,\s*|\s+&\s+|\s+and\s+|\s+\+\s+|\s+featuring\s+|\s+ft\.\s+/i),
  );
  return names
    .map(restore)
    .map((n) => n.trim())
    .filter((n) => n && !/^tba\.?$/i.test(n) && !/^tbd\.?$/i.test(n) && !/^(?:and\s+)?more!?$/i.test(n));
}

/** "Wed, Jul 22" + a year -> "2026-07-22". Returns null if unparseable. */
function parseDate(eventDate: string, year: string): string | null {
  const m = /([A-Za-z]{3,})\.?\s+(\d{1,2})\b/.exec(eventDate.replace(/^[A-Za-z]{3,},\s*/, ""));
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${m[2].padStart(2, "0")}`;
}

/** "6:30 pm" / "7 pm" -> "6:30pm" / "7:00pm". null for anything unparseable. */
function formatTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(raw);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ?? "00";
  return `${hour}:${minute}${m[3].toLowerCase()}m`;
}

/** Pull doors + show times out of "Doors: 6:30 pm || Show: 7 pm" (either half
 * may be absent). */
function parseTimes(raw: string): { doors: string | null; show: string | null } {
  const doors = /doors:\s*([0-9: ]*[ap]\.?m)/i.exec(raw);
  const show = /show:\s*([0-9: ]*[ap]\.?m)/i.exec(raw);
  return {
    doors: formatTime(doors?.[1]),
    show: formatTime(show?.[1]),
  };
}

/** Normalize the venue's age phrasings ("Ages 21 and up", "18+", "18+. Valid
 * ID required", "All Ages") to the "21+" / "18+" / "All Ages" style the schema
 * uses. null when there's nothing usable. */
function normalizeAge(raw: string): string | null {
  const t = clean(raw);
  if (!t) return null;
  if (/all\s+ages/i.test(t)) return "All Ages";
  const m = /(?:ages?\s+)?(\d{1,2})\s*(?:\+|and\s+up|and\s+over|&\s+up)/i.exec(t);
  return m ? `${m[1]}+` : null;
}

type ListEntry = {
  date: string;
  title: string;
  age: string | null;
  doors: string | null;
  show: string | null;
  ticketUrl: string | null;
  eventUrl: string | null;
};

/** Parse the upcoming-events widget into one entry per card. */
function parseList(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];
  let currentYear: string | null = null;

  $(".widgetGeneralView")
    .find(".rhp-events-list-separator-month, .rhpSingleEvent")
    .each((_, el) => {
      const $el = $(el);

      if ($el.hasClass("rhp-events-list-separator-month")) {
        const y = /(\d{4})/.exec(clean($el.text()));
        if (y) currentYear = y[1];
        return;
      }

      if (!currentYear) return; // a card before any month header — shouldn't happen
      const date = parseDate(clean($el.find("#eventDate").first().text()), currentYear);
      const title = clean($el.find("#eventTitle").first().text());
      if (!date || !title) return;

      const { doors, show } = parseTimes(clean($el.find(".eventDoorStartDate").first().text()));
      const eventUrl = $el.find("#eventTitle").first().attr("href") || null;
      const ctaHref = $el.find(".rhp-event-list-cta a").first().attr("href") || null;

      entries.push({
        date,
        title,
        age: normalizeAge($el.find(".eventAgeRestriction").first().text()),
        doors,
        show,
        // The CTA is a real ticket link ("Buy Tickets") except for not-yet-on-sale
        // shows ("ON SALE 8/19"), whose link is a placeholder — fall back to the
        // event's own page there.
        ticketUrl: ctaHref || eventUrl,
        eventUrl,
      });
    });

  return entries;
}

/** Fetch one event page and read the flyer + blurb off its social meta tags.
 * Best-effort: any failure yields nulls, never throws. */
async function fetchDetail(
  url: string,
): Promise<{ flyerUrl: string | null; description: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return { flyerUrl: null, description: null };
    const $ = cheerio.load(await res.text());
    const flyerUrl = $('meta[name="twitter:image"]').attr("content") || null;
    let description = $('meta[name="twitter:description"]').attr("content") || null;
    if (description) {
      // Strip the trailing age/ID boilerplate ("This show is 18+. Valid ID
      // required for entry.") the venue appends to most blurbs.
      description = clean(
        description.replace(/\s*This show is\b[\s\S]*$/i, "").replace(/\s*Valid ID required[\s\S]*$/i, ""),
      ) || null;
    }
    return { flyerUrl, description };
  } catch {
    return { flyerUrl: null, description: null };
  }
}

/** Fetch detail pages for a batch of urls with bounded concurrency. */
async function fetchDetails(
  urls: string[],
): Promise<Map<string, { flyerUrl: string | null; description: string | null }>> {
  const out = new Map<string, { flyerUrl: string | null; description: string | null }>();
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      out.set(url, await fetchDetail(url));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, urls.length) }, worker),
  );
  return out;
}

export async function scrapeAmsterdam(): Promise<ScrapedShow[]> {
  const res = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Amsterdam request failed (${res.status} ${res.statusText})`);
  }
  const entries = parseList(await res.text());

  const detailUrls = [...new Set(entries.map((e) => e.eventUrl).filter((u): u is string => !!u))];
  const details = await fetchDetails(detailUrls);

  return entries.map((e) => {
    const tag = classifyEventType(e.title);
    const bands = tag ? [] : splitBands(e.title);
    // A recognized non-band event, or a title that split to nothing: keep the
    // raw title as the display name and don't feed it through as band members.
    const isShow = !tag && bands.length > 0;
    const headliner = isShow ? bands[0] : e.title;
    const supporting = isShow ? bands.slice(1) : [];
    const allBands = isShow ? bands : [];

    const detail = (e.eventUrl && details.get(e.eventUrl)) || { flyerUrl: null, description: null };

    return {
      venue: VENUE,
      date: e.date,
      headliner,
      supporting,
      allBands,
      flyerUrl: detail.flyerUrl,
      ticketUrl: e.ticketUrl,
      doorsTime: e.doors,
      musicTime: e.show,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: e.eventUrl || EVENTS_URL,
      tag,
      ageRestriction: e.age,
      description: tag ? null : detail.description,
    };
  });
}
