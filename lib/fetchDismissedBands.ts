// Data layer for the "Dismissed Bands" log.
// Fetches the live "Dismissed Bands" tab (written by the Apps Script
// handleDismissedBand_ handler) as CSV via the gviz endpoint and parses it into
// DismissedBand objects. Mirrors lib/fetchNonLocalBands.ts: the fetch uses
// `cache: 'no-store'` plus a cache-busting timestamp so the admin page always
// reflects the latest data.
//
// The "Dismissed Bands" tab is created automatically the first time a band is
// dismissed; gviz reads the live sheet, so no publish-to-web step is needed.
// gid=832751827 targets the "Dismissed Bands" tab.
const DISMISSED_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=832751827&headers=1";

/** The gviz endpoint reads the live sheet, so dismissed reads are always on. */
export const DISMISSED_CONFIGURED = true;

export type DismissedBand = {
  name: string;
  slug: string;
};

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes. Kept in sync with the parser in
 * lib/fetchNonLocalBands.ts.
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

export async function fetchDismissedBands(): Promise<DismissedBand[]> {
  // The tab isn't published yet — behave as if there are no dismissed bands.
  if (!DISMISSED_CONFIGURED) return [];

  let text: string;
  try {
    const url = `${DISMISSED_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchDismissedBands: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchDismissedBands: failed to fetch CSV", err);
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

  const bands: DismissedBand[] = [];
  for (const r of rows.slice(1)) {
    const name = get(r, "NAME");
    if (!name) continue; // skip blank rows

    bands.push({ name, slug: get(r, "SLUG") });
  }

  return bands;
}
