// Scraper for The Birdhaus.
//
// Unlike the other venues, The Birdhaus is our own venue and its shows are
// authored as markdown files (one per show) with YAML frontmatter in a public
// GitHub repo — so there's no HTML to scrape. We list the show directory via
// the GitHub contents API, fetch each file from the raw CDN, and parse the
// frontmatter with gray-matter.
//
// Two things differ from the HTML scrapers on purpose:
//   1. Past shows accumulate in the repo (nothing prunes old files), whereas a
//      venue's events page only lists upcoming shows. So we filter to shows
//      dated today-or-later ourselves — first cheaply by the YYYY-MM-DD prefix
//      in the filename (to avoid fetching old files), then authoritatively by
//      the frontmatter `date`. (The other scrapers rely on upsert-by-sourceKey
//      to avoid reprocessing; here we simply never emit past shows.)
//   2. Band names here are typed by us, not read off a flyer, so exact matches
//      score 1.0 in the matcher and land in the 'auto' tier — this scraper's
//      review-queue rate should be near zero, unlike the flyer-based scrapers.

import matter from "gray-matter";
import type { ScrapedShow } from "./types";

const VENUE = "The Birdhaus";

const REPO = "alexschaafdesign/the-birdhaus";
const SHOWS_PATH = "content/shows";
const BRANCH = "main";

const CONTENTS_API = `https://api.github.com/repos/${REPO}/contents/${SHOWS_PATH}?ref=${BRANCH}`;
const USER_AGENT = "TwinScene/1.0 (+https://twinscene.org)";

// GitHub contents-API entry (only the fields we use).
type ContentsEntry = {
  name: string;
  type: string;
  download_url: string | null;
  html_url: string;
};

// Frontmatter fields we read. Files carry extra keys (photos, videos,
// photographer, …) which gray-matter parses but we ignore.
type ShowFrontmatter = {
  title?: string;
  date?: string | Date;
  doorsTime?: string;
  showTime?: string; // ← maps to ScrapedShow.musicTime
  bands?: { name?: string }[];
  flyer?: string;
  announced?: boolean;
  ticketUrl?: string;
};

/** Today's date (YYYY-MM-DD) in the venue's timezone. */
function todayInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Filenames start with the show date, e.g. "2026-08-01-Lake-Davi.md".
const FILENAME_DATE_RE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Normalize the frontmatter `date` to "YYYY-MM-DD". Dates are quoted strings in
 * the repo (so js-yaml gives us a string), but if one is ever left unquoted
 * js-yaml parses it to a UTC-midnight Date — slice the ISO calendar date off
 * that rather than reformatting (which would shift a day in a west-of-UTC tz).
 */
function normalizeDate(v: string | Date | undefined): string {
  if (typeof v === "string") return v.trim();
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return "";
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };
  // The repo is public, so no auth is required. A token is used only when
  // present, to lift the unauthenticated GitHub API rate limit (60/hr →
  // 5000/hr). Only the directory listing hits the API; raw file fetches are
  // served by GitHub's CDN and don't count against it.
  const token = process.env.BIRDHAUS_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Fetch and parse one show file into a ScrapedShow, or null to skip it. */
async function fetchShow(
  entry: ContentsEntry,
  today: string,
): Promise<ScrapedShow | null> {
  const res = await fetch(entry.download_url as string, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  // A single missing/broken file shouldn't sink the whole run.
  if (!res.ok) return null;

  const { data } = matter(await res.text());
  const fm = data as ShowFrontmatter;

  // Only announced shows go live. Draft/unannounced shows either omit the flag
  // or set it false; skip both.
  if (fm.announced !== true) return null;

  // The frontmatter date is authoritative (the filename prefix was only a cheap
  // pre-filter). Skip anything undated or already past.
  const date = normalizeDate(fm.date);
  if (!date || date < today) return null;

  // Ordered band list; the first entry is the headliner (see the registry note
  // and the marquee-title decision). Drop TBA/TBD placeholders (mirroring the
  // "tba" filtering in the flyer scrapers) and de-duplicate case-insensitively,
  // keeping first-seen order and casing — some files list a band twice.
  const rawBands = Array.isArray(fm.bands)
    ? fm.bands
        .map((b) => (b && typeof b.name === "string" ? b.name.trim() : ""))
        .filter(Boolean)
    : [];
  const seen = new Set<string>();
  const allBands: string[] = [];
  for (const name of rawBands) {
    if (/^tb[ad]\.?$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    allBands.push(name);
  }
  const [headliner = null, ...supporting] = allBands;

  return {
    venue: VENUE,
    date,
    title: typeof fm.title === "string" ? fm.title.trim() || null : null,
    headliner,
    supporting,
    allBands,
    flyerUrl: typeof fm.flyer === "string" ? fm.flyer : null,
    ticketUrl: typeof fm.ticketUrl === "string" ? fm.ticketUrl : null,
    doorsTime: typeof fm.doorsTime === "string" ? fm.doorsTime.trim() : null,
    musicTime: typeof fm.showTime === "string" ? fm.showTime.trim() : null,
    advancePrice: null, // prices aren't tracked in the Birdhaus frontmatter
    dosPrice: null,
    sourceUrl: entry.html_url,
  };
}

export async function scrapeBirdhaus(): Promise<ScrapedShow[]> {
  const today = todayInChicago();

  // 1. List the show directory (single API call).
  const listRes = await fetch(CONTENTS_API, {
    headers: githubHeaders(),
    cache: "no-store",
  });
  if (!listRes.ok) {
    throw new Error(
      `Birdhaus listing failed (${listRes.status} ${listRes.statusText})`,
    );
  }
  const entries = (await listRes.json()) as ContentsEntry[];
  if (!Array.isArray(entries)) {
    throw new Error("Birdhaus listing did not return a file array");
  }

  // 2. Keep markdown files, and cheaply drop clearly-past ones by their
  //    filename date prefix so we don't fetch every archived show. Files with
  //    no parseable date prefix are kept and re-checked after parsing.
  const candidates = entries.filter((e) => {
    if (e.type !== "file" || !e.name.endsWith(".md") || !e.download_url) {
      return false;
    }
    const m = FILENAME_DATE_RE.exec(e.name);
    return !m || m[1] >= today;
  });

  // 3. Fetch + parse each candidate from the raw CDN in parallel.
  const shows = await Promise.all(
    candidates.map((entry) => fetchShow(entry, today)),
  );

  return shows.filter((s): s is ScrapedShow => s !== null);
}
