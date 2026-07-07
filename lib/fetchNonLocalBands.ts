// Data layer for the "Non-Local Bands" log.
// Fetches the live "Non-Local Bands" tab (written by the Apps Script
// handleNonLocalBand_ handler) as CSV via the gviz endpoint and parses it into
// NonLocalBand objects. Like fetchScraperLog.ts, the fetch uses
// `cache: 'no-store'` plus a cache-busting timestamp so the admin page always
// reflects the latest data. gid=2050025979 targets the "Non-Local Bands" tab.
const NON_LOCAL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=2050025979&headers=1";

/** The gviz endpoint reads the live sheet, so non-local reads are always on. */
export const NON_LOCAL_CONFIGURED = true;

export type NonLocalBand = {
  name: string;
  slug: string;
};

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes. Kept in sync with the parser in
 * lib/fetchScraperLog.ts.
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

export async function fetchNonLocalBands(): Promise<NonLocalBand[]> {
  // The tab isn't published yet — behave as if there are no non-local bands.
  if (!NON_LOCAL_CONFIGURED) return [];

  let text: string;
  try {
    const url = `${NON_LOCAL_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchNonLocalBands: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchNonLocalBands: failed to fetch CSV", err);
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

  const bands: NonLocalBand[] = [];
  for (const r of rows.slice(1)) {
    const name = get(r, "NAME");
    if (!name) continue; // skip blank rows

    bands.push({ name, slug: get(r, "SLUG") });
  }

  return bands;
}
