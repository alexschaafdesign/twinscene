// Data layer for the "Venue" tab — booking notes + metadata for venues shows
// get played at. Fetches the live tab as CSV via the gviz endpoint and parses
// it into Venue objects, same approach as lib/fetchNonLocalBands.ts. Same
// spreadsheet as fetchShows.ts/fetchBands.ts; gid=547847398 targets "Venue".

const VENUES_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=547847398&headers=1";

export type Venue = {
  name: string; // "NAME" column
  city: string; // "LOCATION" column — mirrors Band.city
  neighborhood: string; // "NEIGHBORHOOD" column — one value, unlike Band.neighborhoods
  capacity: number | null; // "CAPACITY" column; null if blank/non-numeric
  contact: string;
  notes: string;
  parking: string;
  accessibility: string;
  owner: string;
  // "TYPE" column, hand-assigned in the sheet (e.g. "Independent", "DIY",
  // "First Ave", "Brewery"). Free-form and sheet-driven rather than a fixed
  // enum, since the vocabulary is still being shaped there — "" if blank.
  type: string;
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

function parseCapacity(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sheet values are typed in ALL CAPS (e.g. "FIRST AVE"). Title-case each word
 * for display, except "DIY" — that's an acronym and should stay as-is rather
 * than becoming "Diy".
 */
function formatType(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.toUpperCase() === "DIY") return "DIY";
  return trimmed
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function fetchVenues(): Promise<Venue[]> {
  let text: string;
  try {
    const url = `${VENUES_CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchVenues: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchVenues: failed to fetch CSV", err);
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

  const venues: Venue[] = [];
  for (const row of rows.slice(1)) {
    const name = get(row, "NAME");
    if (!name) continue; // skip blank rows

    venues.push({
      name,
      city: get(row, "LOCATION"),
      neighborhood: get(row, "NEIGHBORHOOD"),
      capacity: parseCapacity(get(row, "CAPACITY")),
      contact: get(row, "CONTACT"),
      notes: get(row, "NOTES"),
      parking: get(row, "PARKING"),
      accessibility: get(row, "ACCESSIBILITY"),
      owner: get(row, "OWNER"),
      type: formatType(get(row, "TYPE")),
    });
  }

  return venues;
}

/**
 * Resolve a Show's free-text venue name to a Venue row. Normalized
 * (trim+lowercase) exact match first; falling back to substring containment
 * either direction, since scraper-written venue names don't always match the
 * tab's names verbatim (e.g. tab "Cloudland" vs scraped "Cloudland Theater").
 */
export function matchVenue(
  venues: Venue[],
  showVenueName: string,
): Venue | undefined {
  const target = showVenueName.trim().toLowerCase();
  if (!target) return undefined;

  const exact = venues.find((v) => v.name.trim().toLowerCase() === target);
  if (exact) return exact;

  return venues.find((v) => {
    const name = v.name.trim().toLowerCase();
    return name && (target.includes(name) || name.includes(target));
  });
}
