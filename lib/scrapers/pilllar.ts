// Scraper for Pilllar Forum's events page.
//
// The page (https://www.pilllar.com/pages/events) is a server-rendered Shopify
// page built with the "sse" page builder. Each show is a two-column `.sse-row`:
// column 0 holds the flyer <img>, column 1 holds the date <h1> followed by
// <p> lines (headliner, supporting acts, price, doors/music times, tickets).
//
// Because the flyer column precedes the text column in document order, a single
// document-order walk over `img, h1, p, a` lets us segment shows by date <h1>
// and attach the most recent flyer image seen before each date.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

// Re-exported so existing importers (e.g. bandMatcher) that reference the type
// via this module keep working; the canonical definition lives in ./types.
export type { ScrapedShow };

const VENUE = "Pilllar Forum";
const SOURCE_URL = "https://www.pilllar.com/pages/events";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// "JUN. 29" -> month abbreviation + day.
const DATE_RE = /^([A-Z]{3})\.\s*(\d+)$/;

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

// Standalone month-name paragraphs act as section dividers on the page.
const MONTH_NAME_RE =
  /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i;

// Shopify thumbnail variants embed the pixel width in the filename.
const THUMBNAIL_RE = /_(120|130|140)x/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Whether an <img> looks like a real flyer rather than a thumbnail/icon. */
function isFlyer(src: string, widthAttr: string | undefined): boolean {
  if (!src || THUMBNAIL_RE.test(src)) return false;
  const width = parseInt(widthAttr || "", 10);
  if (Number.isFinite(width) && width < 100) return false;
  return true;
}

/** Split a "with A, B, and C" supporting-acts string into band names. */
function parseSupporting(text: string): string[] {
  return text
    .replace(/^with\s+/i, "")
    .split(/,\s*and\s+|\s+and\s+|,\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !/^tba$/i.test(s));
}

export async function scrapePilllar(): Promise<ScrapedShow[]> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Pilllar request failed (${res.status} ${res.statusText})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const root = $("#MainContent").length ? $("#MainContent") : $("main");

  const shows: ScrapedShow[] = [];
  let current: ScrapedShow | null = null;
  let pendingFlyer: string | null = null;

  // Track year rollover: dates are listed chronologically without a year, so a
  // date that falls earlier than the previous one means we've crossed into the
  // next year.
  let currentYear = new Date().getFullYear();
  let prevDate: Date | null = null;

  root.find("img, h1, p, a").each((_, el) => {
    const tag = el.tagName;
    const $el = $(el);

    if (tag === "img") {
      const src = $el.attr("src") || "";
      if (isFlyer(src, $el.attr("width"))) pendingFlyer = src;
      return;
    }

    if (tag === "h1") {
      const m = DATE_RE.exec($el.text().trim());
      if (!m) return;
      const month = MONTHS[m[1]];
      const day = parseInt(m[2], 10);
      if (month === undefined || Number.isNaN(day)) return;

      let candidate = new Date(currentYear, month, day);
      if (prevDate && candidate < prevDate) {
        currentYear += 1;
        candidate = new Date(currentYear, month, day);
      }
      prevDate = candidate;

      current = {
        venue: VENUE,
        date: `${currentYear}-${pad(month + 1)}-${pad(day)}`,
        headliner: null,
        supporting: [],
        allBands: [],
        flyerUrl: pendingFlyer,
        ticketUrl: null,
        doorsTime: null,
        musicTime: null,
        advancePrice: null,
        dosPrice: null,
        sourceUrl: SOURCE_URL,
      };
      pendingFlyer = null;
      shows.push(current);
      return;
    }

    if (!current) return;

    if (tag === "a") {
      const href = $el.attr("href") || "";
      if (href.includes("/products/") && !current.ticketUrl) {
        current.ticketUrl = href;
      }
      return;
    }

    // tag === "p"
    const text = $el.text().trim().replace(/\s+/g, " ");
    if (!text || MONTH_NAME_RE.test(text)) return;

    if (/^with\s+/i.test(text)) {
      current.supporting = parseSupporting(text);
      return;
    }

    if (/Advance/i.test(text)) {
      const adv = text.match(/Advance\s*\$?(\d+(?:\.\d+)?)/i);
      const dos = text.match(/Day of Show\s*\$?(\d+(?:\.\d+)?)/i);
      if (adv) current.advancePrice = parseFloat(adv[1]);
      if (dos) current.dosPrice = parseFloat(dos[1]);
      return;
    }

    if (/Doors/i.test(text)) {
      const doors = text.match(/Doors\s*([0-9]{1,2}:[0-9]{2}\s*[ap]m)/i);
      const music = text.match(/Music\s*([0-9]{1,2}:[0-9]{2}\s*[ap]m)/i);
      if (doors) current.doorsTime = doors[1].replace(/\s+/g, "");
      if (music) current.musicTime = music[1].replace(/\s+/g, "");
      return;
    }

    // The headliner is the first bold paragraph after the date. Pilllar wraps
    // it in <b> (inside a <span>); accept <strong> too for resilience.
    if (!current.headliner && $el.find("strong, b").length > 0) {
      current.headliner = text;
    }
  });

  // Derive allBands once parsing of each show is complete.
  for (const show of shows) {
    show.allBands = [show.headliner, ...show.supporting].filter(
      (b): b is string => !!b,
    );
  }

  return shows;
}
