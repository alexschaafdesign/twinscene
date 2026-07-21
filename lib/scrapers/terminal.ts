// Scraper for The Terminal Bar's live-music calendar.
//
// The venue runs a hand-maintained WordPress.com site. The public page
// (https://terminalbarmn.com/live-music/) is one month at a time, but rather
// than scrape the full themed HTML we ask WordPress.com's REST API for just
// the page's rendered block content — much smaller and more stable across
// theme tweaks:
//   https://public-api.wordpress.com/wp/v2/sites/terminalbarmn.com/pages?slug=live-music
//
// That content is a flat run of blocks. The first <h2> is the calendar header
// ("LIVE Music Calendar<br>JULY 2026<br>..."), which is where the YEAR comes
// from — individual events name their month but not their year. Every
// subsequent <h2 class="wp-block-heading"> is one event, laid out as:
//   <Weekday> <Month> <Nth><br><band bill, one act or "/"-separated per line>
// followed by a <figure> flyer image. Example:
//   "Friday July 10th<br>Dashed / Far Far Away / Peony Park<br>Short Timer"
//
// So: the first text line is the date; every remaining line is part of the
// bill, and acts within a line are split on "/". A handful of entries are not
// shows at all ("Closed for the Holiday", "Closed / PRIVATE PARTY") — those get
// an event-type tag and keep their raw title instead of being split into
// "bands", mirroring whitesquirrel.ts / hookandladder.ts. Non-music/closed
// entries and past dates are dropped from music parsing but still tagged so
// they land harmlessly in the review queue rather than auto-importing.

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ScrapedShow } from "./types";

const VENUE = "The Terminal Bar";
const SOURCE_URL = "https://terminalbarmn.com/live-music/";
const API_URL =
  "https://public-api.wordpress.com/wp/v2/sites/terminalbarmn.com/pages?slug=live-music";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

// A month name followed by a day number, with an optional ordinal suffix:
// "July 1st", "July 22nd", "July 4th". Weekday prefix (always present) is
// ignored — the day/month is all we need.
const DATE_RE =
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i;

// Entries that aren't a band bill. Keep specific so a real act name can't be
// swallowed. Extend if another non-show entry shows up in the review queue.
const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/private\s+(party|event)/i, "Private Event"],
  [/\bclosed\b/i, "Closed"],
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function classifyEventType(text: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Today's date in the venue's local time, as YYYY-MM-DD. */
function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Split an <h2>'s inner HTML into its text lines, one per <br>. */
function headingLines($: cheerio.CheerioAPI, el: Element): string[] {
  const html = $(el).html() ?? "";
  return html
    .split(/<br\s*\/?>/i)
    .map((chunk) => cheerio.load(`<x>${chunk}</x>`)("x").text())
    // Collapse whitespace incl. the &nbsp; some entries carry ( ).
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Split one bill line into act names on "/", dropping empties/TBA. */
function splitActs(line: string): string[] {
  return line
    // A leading "Tribute Night:" (etc.) label prefixes the first act; drop it
    // so the act name matches cleanly rather than sitting in the review queue.
    .replace(/^[A-Za-z ]+night:\s*/i, "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && !/^tba\.?$/i.test(s) && !/^tbd\.?$/i.test(s));
}

export async function scrapeTerminal(): Promise<ScrapedShow[]> {
  const res = await fetch(API_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Terminal Bar request failed (${res.status} ${res.statusText})`);
  }
  const pages = (await res.json()) as { content?: { rendered?: string } }[];
  const content = pages[0]?.content?.rendered;
  if (!content) return [];

  const $ = cheerio.load(content);

  // The calendar header (first heading) carries "MONTH YEAR". Everything after
  // it that parses to a date is an event. Fall back to the current Chicago
  // month/year if the header is ever missing or reformatted.
  const today = chicagoToday();
  let headerMonth = parseInt(today.slice(5, 7), 10) - 1;
  let headerYear = parseInt(today.slice(0, 4), 10);
  const firstHeading = $("h2").first().text();
  const headerYearMatch = firstHeading.match(/\b(20\d{2})\b/);
  const headerMonthMatch = firstHeading.match(
    /january|february|march|april|may|june|july|august|september|october|november|december/i,
  );
  if (headerYearMatch) headerYear = parseInt(headerYearMatch[1], 10);
  if (headerMonthMatch) headerMonth = MONTHS[headerMonthMatch[0].toLowerCase()];

  const shows: ScrapedShow[] = [];

  // Each event is a heading — usually <h2>, but the venue hand-edits the page
  // and occasionally leaves one as <h1>, so match both and let DATE_RE decide
  // what's an event (the calendar header and any stray heading parse to no date
  // and fall through).
  const HEADINGS = "h1, h2";
  $(HEADINGS).each((_, el) => {
    const lines = headingLines($, el);
    if (lines.length === 0) return;

    const dateMatch = DATE_RE.exec(lines[0]);
    if (!dateMatch) return; // header / non-event heading

    const month = MONTHS[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2], 10);
    if (month === undefined || Number.isNaN(day)) return;
    // The calendar is one month, but roll the year forward if a December
    // calendar happens to list a January date.
    const year = month >= headerMonth ? headerYear : headerYear + 1;
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;

    // Drop entries from earlier in the month that have already happened.
    if (date < today) return;

    // The flyer is the first image between this heading and the next. It's
    // usually a sibling <figure>, but some entries nest it inside wrapper
    // <div>s, so search descendants of everything up to the next heading.
    const flyerSrc = $(el).nextUntil(HEADINGS).find("img").first().attr("src");
    const flyerUrl = flyerSrc ? flyerSrc.split("?")[0] : null;

    const billLines = lines.slice(1);
    const billText = billLines.join(" / ");
    const tag = classifyEventType(billText);

    let headliner: string | null;
    let supporting: string[];
    let allBands: string[];
    if (tag) {
      // Not a band bill (e.g. "Closed for the Holiday") — keep the raw text as
      // the display title rather than splitting it into acts.
      headliner = billText || tag;
      supporting = [];
      allBands = [];
    } else {
      allBands = billLines.flatMap(splitActs);
      if (allBands.length === 0) return;
      [headliner, ...supporting] = allBands;
    }

    shows.push({
      venue: VENUE,
      date,
      headliner,
      supporting,
      allBands,
      flyerUrl,
      // The calendar links nowhere per-event and lists no set/door times, so
      // point ticket/info at the venue's live-music page generically.
      ticketUrl: SOURCE_URL,
      doorsTime: null,
      musicTime: null,
      advancePrice: null,
      dosPrice: null,
      sourceUrl: SOURCE_URL,
      tag,
    });
  });

  return shows;
}
