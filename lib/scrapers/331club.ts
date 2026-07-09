// Scraper for 331 Club's calendar.
//
// https://331club.com/#calendar is a custom WordPress theme, statically
// rendered (no widget, no JSON feed) — the "#calendar" anchor just scrolls to
// a `.entry-content.events` block holding one `.event` div per date. The full
// season (observed: mid-July through late October) is already in the markup;
// dates beyond the first week are just class="event hidden" and revealed
// client-side by a "See all upcoming events..." link, so a plain fetch still
// gets everything.
//
// Each `.event` has an `.event-date` (month/day spans, no year — same
// rollover problem as pilllar.ts) and one or more `.column`s under
// `.event-content`. A date with a main evening show *and* an unrelated
// afternoon/early booking (or a recurring non-band slot like trivia or bingo)
// gets one column each — so a single `.event` can produce zero, one, or
// several ScrapedShows. Within a column, every act and the time are each on
// their own line (<br>-separated inside a <p>, or rarely an <ol><li>); there's
// no comma/slash bill-splitting heuristic needed like other venues, just a
// line-by-line read.
//
// Two recurring wrinkles in how the venue writes these lines:
//  - Residency nights prefix the lineup with a header line ending in
//    "featuring" or "presents" (e.g. "July Conspiracy Series featuring",
//    "Gabe Barnett presents") — stripping that trailing word off leaves
//    whatever real name preceded it (or nothing, for a bare series title;
//    that just falls back to the review queue like any other scraper's
//    ambiguous case).
//  - A few slots have no lineup yet ("TBA") or are known non-music fixtures
//    (movie trivia, bingo, a drawing-class night) — both are dropped rather
//    than queued, same as other venues' open-mic/bingo filtering.
//
// No ticket links, prices, or flyer images appear anywhere on this page.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

const VENUE = "331 Club";
const CALENDAR_URL = "https://331club.com/#calendar";
const PAGE_URL = "https://331club.com/";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// Recurring non-band fixtures on this calendar.
const NON_MUSIC_RE = /\btrivia\b|\bbingo\b|spelling bee|dr\.?\s*sketchy/i;

// A line that's just a header introducing the names on the following lines
// ("July Conspiracy Series featuring", "Gabe Barnett presents").
const TRAILING_FILLER_RE = /\s+(presents|featuring):?$/i;

// A line's own time slot ("9:30pm", "7pm", "2-4pm" — ranges give the start
// time). Not anchored at the end: source typos ("7pmyt") still match.
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(?:[-–]\s*\d{1,2}(?::\d{2})?)?\s*(am|pm)/i;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Strip a leading/trailing quote pair (straight or curly) wrapping a line. */
function stripQuotes(s: string): string {
  return s.replace(/^["“'‘]+|["”'’]+$/g, "");
}

function formatTime(raw: string): string | null {
  const m = TIME_RE.exec(raw);
  if (!m) return null;
  const hour = parseInt(m[1], 10) % 24 || 12;
  const minute = m[2] ?? "00";
  return `${hour}:${minute}${m[3].toLowerCase()}`;
}

/** Split a column's HTML on <br>, returning decoded/trimmed text lines. */
function extractLines($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>): string[] {
  const html = container.html() ?? "";
  return html
    .split(/<br\s*\/?>/i)
    .map((fragment) => $("<div>").html(fragment).text().replace(/ /gi, " ").trim())
    .filter(Boolean);
}

function parseColumn($: cheerio.CheerioAPI, column: cheerio.Cheerio<any>, date: string): ScrapedShow | null {
  const container = column.find("p, li").first();
  const lines = extractLines($, container);
  if (lines.length === 0) return null;

  let musicTime: string | null = null;
  const nameLines: string[] = [];
  for (const line of lines) {
    if (musicTime === null && TIME_RE.test(line)) {
      musicTime = formatTime(line);
      continue;
    }
    nameLines.push(line);
  }

  const joined = nameLines.join(" ");
  if (NON_MUSIC_RE.test(joined)) return null;

  const allBands = nameLines
    .filter((line) => !(line.startsWith("(") && line.endsWith(")"))) // parenthetical asides
    .map((line) => stripQuotes(line.replace(TRAILING_FILLER_RE, "")).trim())
    .filter((line) => line && !/^tba$/i.test(line));
  if (allBands.length === 0) return null;

  const [headliner, ...supporting] = allBands;

  return {
    venue: VENUE,
    date,
    headliner,
    supporting,
    allBands,
    flyerUrl: null,
    ticketUrl: null,
    doorsTime: null,
    musicTime,
    advancePrice: null,
    dosPrice: null,
    sourceUrl: CALENDAR_URL,
  };
}

export async function scrape331Club(): Promise<ScrapedShow[]> {
  const res = await fetch(PAGE_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`331 Club request failed (${res.status} ${res.statusText})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const shows: ScrapedShow[] = [];
  let currentYear = new Date().getFullYear();
  let prevDate: Date | null = null;

  $(".entry-content.events > .event").each((_, el) => {
    const $event = $(el);
    const month = MONTHS[$event.find(".month").text().trim().toLowerCase()];
    const day = parseInt($event.find(".date").text().trim(), 10);
    if (month === undefined || Number.isNaN(day)) return;

    let candidate = new Date(currentYear, month, day);
    if (prevDate && candidate < prevDate) {
      currentYear += 1;
      candidate = new Date(currentYear, month, day);
    }
    prevDate = candidate;
    const date = `${currentYear}-${pad(month + 1)}-${pad(day)}`;

    $event.find(".column").each((__, col) => {
      const show = parseColumn($, $(col), date);
      if (show) shows.push(show);
    });
  });

  return shows;
}
