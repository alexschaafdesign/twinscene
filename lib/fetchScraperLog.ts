// Data layer for the scraper digest log.
// Fetches a published Google Sheet (CSV) — the "Scraper Log" tab written by the
// Apps Script handleScraperLog_ handler — and parses it into ScraperLogRow
// objects. Like fetchShows.ts, the fetch uses `cache: 'no-store'` plus a
// cache-busting timestamp so the admin page always reflects the latest runs.

// TODO: replace YOUR_SCRAPER_LOG_GID with the real gid once the "Scraper Log"
// tab is published to the web (File → Share → Publish to web → that tab → CSV).
const SCRAPER_LOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSeDcefYYw19XAqsyo5d_VKSbS8LkwtUgHzV5ZZCcfYforhoZDdR-CpbCK4__z0nmajAbb0MK_9xVoQ/pub?gid=1124015887&single=true&output=csv';

/** Whether the log CSV URL has had its real gid filled in yet. */
export const SCRAPER_LOG_CONFIGURED = true;

export type ScraperLogRow = {
  timestamp: string;
  scrapersRun: string;
  totalAutoImported: number;
  totalQueued: number;
  totalNewBands: number;
  newBandNames: string[];
  rawJson: string;
};

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes. Kept in sync with the parser in
 * lib/fetchShows.ts (RAW_JSON in particular contains commas and quotes).
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (char === "\r") {
      i++; // ignore — handled by the following \n
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += char;
      i++;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export async function fetchScraperLog(): Promise<ScraperLogRow[]> {
  // The tab isn't published yet — render the admin page without log data.
  if (!SCRAPER_LOG_CONFIGURED) return [];

  let text: string;
  try {
    const url = `${SCRAPER_LOG_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchScraperLog: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchScraperLog: failed to fetch CSV", err);
    return [];
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  // Map column names (case-insensitive) to their index.
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col: Record<string, number> = {};
  header.forEach((name, idx) => {
    if (name) col[name] = idx;
  });

  const get = (r: string[], name: string): string => {
    const idx = col[name];
    if (idx === undefined) return "";
    return (r[idx] ?? "").trim();
  };

  const toInt = (v: string): number => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const log: ScraperLogRow[] = [];
  for (const r of rows.slice(1)) {
    const timestamp = get(r, "TIMESTAMP");
    if (!timestamp) continue; // skip blank rows

    const namesRaw = get(r, "NEW_BAND_NAMES");
    log.push({
      timestamp,
      scrapersRun: get(r, "SCRAPERS_RUN"),
      totalAutoImported: toInt(get(r, "TOTAL_AUTO_IMPORTED")),
      totalQueued: toInt(get(r, "TOTAL_QUEUED")),
      totalNewBands: toInt(get(r, "TOTAL_NEW_BANDS")),
      newBandNames: namesRaw
        ? namesRaw.split(", ").map((s) => s.trim()).filter(Boolean)
        : [],
      rawJson: get(r, "RAW_JSON"),
    });
  }

  // Most recent first. Timestamps are ISO strings, so lexical sort works.
  log.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return log;
}
