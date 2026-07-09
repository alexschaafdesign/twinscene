// Data layer for the "Press" tab — the directory of press outlets whose daily
// or weekly show lists get parsed and starred (see lib/scrapers/starPress.ts).
// Same shape as fetchVenues.ts: a directory sheet Alex edits directly, no
// admin UI. Uses the tab's numeric gid, same as every other fetch* module —
// gviz's name-based `sheet=` param silently falls back to a different tab on
// a mismatch instead of erroring, so a gid is the only reliable way to target
// a specific tab.
const PRESS_GID = "1509676405";
const PRESS_CSV_URL = `https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=${PRESS_GID}&headers=1`;

export type Press = {
  name: string; // "NAME" column, e.g. "crawl space"
  slug: string; // "SLUG" column — matches the id written into a show's STARRED_BY
  website: string; // "WEBSITE" column
  notes: string;
};

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes. Kept in sync with the parser in
 * lib/fetchVenues.ts.
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

/** Lowercase, collapse non-alphanumeric runs into single hyphens, trim hyphens. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function fetchPress(): Promise<Press[]> {
  let text: string;
  try {
    const url = `${PRESS_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // Tolerate the tab not existing yet — display falls back to raw ids.
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchPress: failed to fetch CSV", err);
    return [];
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return [];

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

  const press: Press[] = [];
  for (const row of rows.slice(1)) {
    const name = get(row, "NAME");
    if (!name) continue;

    const slugRaw = get(row, "SLUG");
    press.push({
      name,
      slug: slugRaw || slugify(name),
      website: get(row, "WEBSITE"),
      notes: get(row, "NOTES"),
    });
  }

  return press;
}
