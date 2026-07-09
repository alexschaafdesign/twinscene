// Scraper for The Mess's events page.
//
// https://www.itsthemess.com/events is a Squarespace *page* (not an Events
// Collection like Berlin's calendar — there's no `?format=json` events feed),
// hand-built from Squarespace's "Fluid Engine" grid: every date, band list,
// price line, ticket button, and flyer image is its own absolutely-positioned
// block rather than a nested per-show element. There's nothing in the DOM
// that groups a show's blocks together — what ties them to each other is
// which grid row they land on. Squarespace assigns each block's row via a
// `.fe-block-<id> { grid-area: rowStart/colStart/rowEnd/colEnd }` rule in a
// page-wide <style> tag (mobile-first, overridden by a desktop rule later in
// the same tag — we want the later, desktop one, so we keep the last match
// per block id when scanning the CSS). A show's text block and its "Tickets"
// button always share the exact same rowStart; its flyer image (when the
// show has one — many don't yet, since lineups are often still TBD) sits a
// few rows above, so we attach the nearest image within a small row window
// instead of requiring an exact match.
//
// No showtime is published on the page at all (confirmed against several
// events), so doorsTime/musicTime are always null here.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

const VENUE = "The Mess";
const EVENTS_URL = "https://www.itsthemess.com/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// A flyer more than this many rows above a show's text block is assumed to
// belong to some other block on the page, not that show.
const MAX_FLYER_ROW_DISTANCE = 15;

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

const DATE_RE = /^([a-z]+)\s+(\d{1,2}),\s*(\d{4})/i;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a leading "month day, year" off a line, ignoring any trailing text
 * (e.g. "october 30, 2026 THE MONSTER MESS"). */
function parseDate(line: string): string | null {
  const m = DATE_RE.exec(line.trim());
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Split a comma-separated band list; "TBD" means no lineup yet. */
function splitBands(line: string): string[] {
  if (/^tbd$/i.test(line.trim())) return [];
  return line
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n && !/^tbd$/i.test(n));
}

function parsePricing(line: string): {
  advancePrice: number | null;
  dosPrice: number | null;
} {
  const m = line.match(/\$(\d+(?:\.\d+)?)/);
  if (!m) return { advancePrice: null, dosPrice: null };
  const price = parseFloat(m[1]);
  if (/at the door/i.test(line)) return { advancePrice: null, dosPrice: price };
  return { advancePrice: price, dosPrice: null };
}

/** Map of fe-block-<id> -> grid row-start, keyed off the page-wide <style>
 * block. Each id has a mobile rule followed by a desktop-override rule with
 * the same id; taking the last match per id gets the desktop value both
 * text/button/image rows were measured against above. */
function extractRowStarts(html: string): Map<string, number> {
  const rows = new Map<string, number>();
  const re = /\.fe-block-([a-f0-9]+)\s*\{\s*grid-area:\s*(\d+)\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    rows.set(m[1], parseInt(m[2], 10));
  }
  return rows;
}

function feBlockId($el: cheerio.Cheerio<any>): string | null {
  const cls = $el.closest("[class*=fe-block-]").attr("class") || "";
  const m = /fe-block-([a-f0-9]+)/.exec(cls);
  return m ? m[1] : null;
}

type ImageCandidate = { row: number; url: string };
type ButtonCandidate = { row: number; url: string };

export async function scrapeTheMess(): Promise<ScrapedShow[]> {
  const res = await fetch(EVENTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`The Mess request failed (${res.status} ${res.statusText})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const rowStarts = extractRowStarts(html);

  const images: ImageCandidate[] = [];
  $(".sqs-block-image.image-block").each((_, el) => {
    const $el = $(el);
    const id = feBlockId($el);
    const row = id ? rowStarts.get(id) : undefined;
    const img = $el.find("img").first();
    const url = img.attr("data-image") || img.attr("src") || "";
    if (row !== undefined && url) images.push({ row, url });
  });

  const buttons: ButtonCandidate[] = [];
  $(".sqs-block-button.button-block").each((_, el) => {
    const $el = $(el);
    const id = feBlockId($el);
    const row = id ? rowStarts.get(id) : undefined;
    const href = $el.find("a[href]").first().attr("href") || "";
    if (row !== undefined && href) buttons.push({ row, url: href });
  });

  const shows: ScrapedShow[] = [];

  $(".sqs-block-html.html-block").each((_, el) => {
    const $el = $(el);
    const lines = $el
      .find(".sqs-html-content > p")
      .map((__, p) => $(p).text().trim())
      .get()
      .filter((t) => t.length > 0);
    if (lines.length === 0) return;

    const date = parseDate(lines[0]);
    if (!date) return; // not an event block

    // Every show ends with a "@ the mess" line, then the band list (or
    // "TBD"), then the price line — but some (e.g. themed one-offs like "THE
    // MONSTER MESS") insert an extra title paragraph between the date and
    // "@ the mess", shifting everything else down. The price line is always
    // last, so anchor off it rather than assuming a fixed line count.
    const priceIndex = lines.findIndex((l) => l.startsWith("$"));
    const bandLine = priceIndex > 0 ? lines[priceIndex - 1] : undefined;
    const priceLine = priceIndex >= 0 ? lines[priceIndex] : undefined;

    const allBands = bandLine ? splitBands(bandLine) : [];
    if (allBands.length === 0) return; // TBD lineup — nothing to link a show to
    const [headliner, ...supporting] = allBands;

    const id = feBlockId($el);
    const row = id ? rowStarts.get(id) : undefined;

    let ticketUrl: string | null = null;
    let flyerUrl: string | null = null;
    if (row !== undefined) {
      const button = buttons.find((b) => b.row === row);
      ticketUrl = button ? button.url : null;

      let bestImage: ImageCandidate | null = null;
      let bestDistance = Infinity;
      for (const img of images) {
        const distance = row - img.row;
        if (distance >= 0 && distance < bestDistance && distance <= MAX_FLYER_ROW_DISTANCE) {
          bestDistance = distance;
          bestImage = img;
        }
      }
      flyerUrl = bestImage ? bestImage.url : null;
    }

    const { advancePrice, dosPrice } = priceLine
      ? parsePricing(priceLine)
      : { advancePrice: null, dosPrice: null };

    shows.push({
      venue: VENUE,
      date,
      headliner,
      supporting,
      allBands,
      flyerUrl,
      ticketUrl,
      doorsTime: null,
      musicTime: null,
      advancePrice,
      dosPrice,
      sourceUrl: EVENTS_URL,
    });
  });

  return shows;
}
