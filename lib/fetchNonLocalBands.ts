// Data layer for the "Non-Local Bands" log.
// Fetches a published Google Sheet (CSV) — the "Non-Local Bands" tab written by
// the Apps Script handleNonLocalBand_ handler — and parses it into NonLocalBand
// objects. Like fetchScraperLog.ts, the fetch uses `cache: 'no-store'` plus a
// cache-busting timestamp so the admin page always reflects the latest data.

// TODO: replace YOUR_NON_LOCAL_GID with the real gid once the "Non-Local Bands"
// tab is published to the web (File → Share → Publish to web → that tab → CSV).
const NON_LOCAL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeDcefYYw19XAqsyo5d_VKSbS8LkwtUgHzV5ZZCcfYforhoZDdR-CpbCK4__z0nmajAbb0MK_9xVoQ/pub?gid=YOUR_NON_LOCAL_GID&single=true&output=csv";

/** Whether the non-local CSV URL has had its real gid filled in yet. */
export const NON_LOCAL_CONFIGURED =
  !NON_LOCAL_CSV_URL.includes("YOUR_NON_LOCAL_GID");

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
