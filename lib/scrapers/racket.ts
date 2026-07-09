// Parser for Racket's weekly "Your Complete Concert Calendar" post — one of
// the Press-tab outlets whose picks star shows elsewhere in our own list
// (see lib/scrapers/starPress.ts). Racket tags every week's calendar post
// "music-listings", so the tag feed's newest item is always the latest
// calendar without needing a hardcoded/guessed URL.
//
// Unlike Crawl Space's clean per-pick Substack markup, Racket's calendar is
// one long WordPress post: a run of plain `<p><a>Artist @ Venue</a></p>`
// listings grouped under `<h2>Weekday, Month Day</h2>` headers (no year), with
// a handful of picks promoted to `<ul><li><span><strong><a>Artist @ Venue</a>
// —</strong>blurb...<strong><em>—Byline</em></strong></span></li></ul>` —
// those are the ones with a critic's writeup, i.e. the recommended ones. Only
// those featured `<ul>` picks are parsed; the plain `<p>` listings are left
// alone, same as Crawl Space's non-featured list.
//
// The `.PostContent_content__FblEJ` wrapper is a CSS-module class name from
// Racket's Next.js build, so it can drift on a Racket redesign — if this
// scraper starts returning nothing, check whether that class changed.

import * as cheerio from "cheerio";
import type { ScrapedShow } from "./types";

const TAG_FEED_URL = "https://racketmn.com/tag/music-listings/feed";
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";
export const RACKET_PRESS_ID = "racket";

const CONTENT_SELECTOR = ".PostContent_content__FblEJ";

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

// "Wednesday, July 8" — day-of-week name is unused, just needs to be present.
const DAY_HEADING_RE = /^[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2})/;

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function scrapeRacket(): Promise<ScrapedShow[]> {
  const feedRes = await fetch(TAG_FEED_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!feedRes.ok) {
    throw new Error(`Racket feed request failed (${feedRes.status})`);
  }
  const feedXml = await feedRes.text();
  const $feed = cheerio.load(feedXml, { xmlMode: true });
  const postUrl = $feed("item").first().children("link").first().text().trim();
  if (!postUrl) return [];

  const pageRes = await fetch(postUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!pageRes.ok) {
    throw new Error(`Racket post request failed (${pageRes.status})`);
  }
  const html = await pageRes.text();
  const $ = cheerio.load(html);

  const root = $(CONTENT_SELECTOR).first();
  if (root.length === 0) return [];

  const shows: ScrapedShow[] = [];
  let currentYear = new Date().getFullYear();
  let currentDate: string | null = null;
  let prevMonthDay: number | null = null;

  root.children().each((_, el) => {
    if (el.tagName === "h2") {
      const m = DAY_HEADING_RE.exec($(el).text().trim());
      if (!m) return;
      const month = MONTHS[m[1].toLowerCase()];
      const day = parseInt(m[2], 10);
      if (month === undefined || Number.isNaN(day)) return;

      // Headings run in chronological order through the week; a date earlier
      // than the previous one means the week crossed into January.
      const monthDay = month * 100 + day;
      if (prevMonthDay !== null && monthDay < prevMonthDay) currentYear++;
      prevMonthDay = monthDay;
      currentDate = formatDate(currentYear, month, day);
      return;
    }

    if (el.tagName !== "ul" || !currentDate) return;

    $(el)
      .find("li")
      .each((_, li) => {
        const $li = $(li);
        const $link = $li.find("a").first();
        if ($link.length === 0) return;

        const titleText = $link.text().trim(); // "Artist, Artist @ Venue"
        const sourceUrl = $link.attr("href") || "";
        const atIdx = titleText.lastIndexOf(" @ ");
        if (atIdx === -1) return;

        const billing = titleText.slice(0, atIdx).trim();
        const venue = titleText.slice(atIdx + 3).trim();
        if (!billing || !venue) return;

        // Racket separates co-bills with "," or "+" and sometimes appends a
        // parenthetical note like "(Album Release)" to one act's name.
        const allBands = billing
          .replace(/\([^)]*\)/g, "")
          .split(/,|\+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (allBands.length === 0) return;

        // Blurb is everything in the <li> after the linked title, minus the
        // leading "—" separator and the trailing "—Byline" every pick ends
        // with (bylines are short, so a second em dash within ~80 chars of
        // the end reliably marks where it starts).
        const $blurb = $li.clone();
        $blurb.find("a").first().remove();
        const blurb =
          $blurb
            .text()
            .trim()
            .replace(/^—\s*/, "")
            .replace(/—[^—]{1,80}$/, "")
            .trim() || null;

        shows.push({
          venue,
          date: currentDate,
          headliner: allBands[0],
          supporting: allBands.slice(1),
          allBands,
          flyerUrl: null,
          ticketUrl: sourceUrl || null,
          doorsTime: null,
          musicTime: null,
          advancePrice: null,
          dosPrice: null,
          sourceUrl: sourceUrl || postUrl,
          press: RACKET_PRESS_ID,
          blurb,
          pressPostUrl: postUrl,
        });
      });
  });

  return shows;
}
