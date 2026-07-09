// Data layer for upcoming shows.
// Fetches the live "Shows" tab of the band-directory spreadsheet as CSV and
// parses it into Show objects. Like fetchBands.ts, the fetch uses
// `cache: 'no-store'` plus a cache-busting timestamp so the list always
// reflects the latest sheet data.

// Same spreadsheet as fetchBands.ts, read through the live gviz endpoint (not
// the cached publish-to-web feed) so edits show up almost immediately. Uses the
// raw spreadsheet id; headers=1 keeps the header row out of the data; gid
// targets the "Shows" tab.
const SHOWS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=1656115359&headers=1";

export type Show = {
  id: string; // stable per-row id used to target edits ("" for un-backfilled rows)
  date: string; // raw string from sheet, e.g. "2026-07-15"
  venue: string;
  title: string; // marquee / headliner — the show's display title
  lineup: string; // full lineup, e.g. "shugE, Average Joey, Ditch Pigeon"
  bandSlugs: string[]; // directory slugs this show links to (0..n)
  notes: string;
  link: string;
  flyerUrl: string; // scraped poster image URL ("" when none)
  source: string; // "manual" | "pilllar" | …
  sourceKey: string; // stable dedup key for scraped shows ("" for manual)
  added: string;
  starredBy: string[]; // curator ids that recommended this show (e.g. "crawlspace")
  starredNotes: Record<string, StarredNote>; // curator id -> their blurb/source link, when given
};

export type StarredNote = { blurb: string; url: string };

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes. Kept in sync with the parser in
 * lib/fetchBands.ts.
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

  // Flush any trailing field/row not terminated by a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Today's date as "YYYY-MM-DD" in America/Chicago (en-CA yields ISO order). */
function todayInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function fetchShows(): Promise<Show[]> {
  let text: string;
  try {
    const url = `${SHOWS_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchShows: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchShows: failed to fetch CSV", err);
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

  const get = (row: string[], name: string): string => {
    const idx = col[name];
    if (idx === undefined) return "";
    return (row[idx] ?? "").trim();
  };

  const today = todayInChicago();
  const shows: Show[] = [];

  const splitSlugs = (s: string): string[] =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  // STARRED_NOTES holds a curator-id -> { blurb, url } JSON object; tolerate
  // blank/malformed cells (pre-migration rows, hand edits) by falling back to
  // {}, and normalize the older plain-string-blurb shape written before the
  // url field existed.
  const parseStarredNotes = (s: string): Record<string, StarredNote> => {
    if (!s) return {};
    try {
      const parsed = JSON.parse(s);
      if (!parsed || typeof parsed !== "object") return {};
      const notes: Record<string, StarredNote> = {};
      for (const [id, value] of Object.entries(parsed)) {
        if (typeof value === "string") notes[id] = { blurb: value, url: "" };
        else if (value && typeof value === "object") {
          const v = value as { blurb?: string; url?: string };
          notes[id] = { blurb: v.blurb ?? "", url: v.url ?? "" };
        }
      }
      return notes;
    } catch {
      return {};
    }
  };

  for (const row of rows.slice(1)) {
    const date = get(row, "DATE");
    // Skip rows with no date or a date in the past (string compare works for
    // ISO YYYY-MM-DD dates).
    if (!date || date < today) continue;

    // Show-centric columns, with fallback to the legacy per-band columns
    // (SLUG/BAND_NAME) so existing rows keep working before the sheet is
    // migrated to the new schema.
    const legacyName = get(row, "BAND_NAME");
    const legacySlug = get(row, "SLUG");
    const bandSlugsRaw = get(row, "BAND_SLUGS");

    shows.push({
      id: get(row, "ID"),
      date,
      venue: get(row, "VENUE"),
      title: get(row, "TITLE") || legacyName,
      lineup: get(row, "LINEUP") || legacyName,
      bandSlugs: bandSlugsRaw
        ? splitSlugs(bandSlugsRaw)
        : legacySlug
          ? [legacySlug]
          : [],
      notes: get(row, "NOTES"),
      link: get(row, "LINK"),
      flyerUrl: get(row, "FLYER"),
      source: get(row, "SOURCE"),
      sourceKey: get(row, "SOURCE_KEY"),
      added: get(row, "ADDED"),
      starredBy: splitSlugs(get(row, "STARRED_BY")),
      starredNotes: parseStarredNotes(get(row, "STARRED_NOTES")),
    });
  }

  // Sort by date ascending.
  shows.sort((a, b) => a.date.localeCompare(b.date));

  return shows;
}
