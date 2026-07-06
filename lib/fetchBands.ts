// Data layer for the Twin Cities Music Scene directory.
// Fetches the Google Sheet as CSV and parses it into Band objects.
// The fetch uses `cache: 'no-store'` (plus a cache-busting timestamp) so the
// directory always reflects the latest sheet data rather than a cached copy.
//
// We read the live "gviz" export (Google Visualization API) rather than the
// "Publish to web" CSV. Publish-to-web is a separate cached snapshot served
// from multiple edge caches that refresh on Google's own schedule, so freshly
// edited/added data (and new columns) would flicker in and out for minutes.
// gviz reflects the live sheet almost immediately. `headers=1` is required —
// without it gviz folds the header row into the first data row. `gid=0` is the
// Index tab; the sheet must be shared "anyone with the link can view".
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=0&headers=1";

// A band-curated "linktree" entry: the top things they want people to see
// (show tickets, a new release, etc.). `image` is a best-effort og:image the
// Apps Script pulls from the URL at submission time; blank when none resolved.
export type FeaturedLink = { url: string; label: string; image: string };

export type Band = {
  name: string;
  slug: string;
  genres: string[];
  city: string; // from the sheet's LOCATION column (e.g. "Minneapolis")
  neighborhoods: string[]; // finer-grained areas within the city; may be empty
  members: string[]; // individual people in the band; may be empty
  contactEmail: string; // public contact address, shown on the profile
  contactMethod: string; // "" | "email" | "instagram" | "website" — the band's preferred contact
  bio: string;
  image: string;
  website: string;
  instagram: string; // handle only
  bandcamp: string; // raw Bandcamp URL the submitter provided
  bandcampEmbedUrl: string; // resolved EmbeddedPlayer URL (blank if unresolved)
  bandcampEmbedHeight: number; // height to render the embed iframe at (px)
  featuredLinks: FeaturedLink[]; // up to 3 band-curated highlight links
  added: string;
};

/** Parse the FEATURED_LINKS JSON cell into a validated FeaturedLink[]. */
function parseFeaturedLinks(raw: string): FeaturedLink[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
      .map((l) => ({
        url: typeof l.url === "string" ? l.url : "",
        label: typeof l.label === "string" ? l.label : "",
        image: typeof l.image === "string" ? l.image : "",
      }))
      .filter((l) => l.url);
  } catch {
    return [];
  }
}

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
 * (""), and newlines/commas inside quotes — all of which Google Sheets emits.
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

/** Lowercase, collapse non-alphanumeric runs into single hyphens, trim hyphens. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reduce a full URL or "@handle" to just the bare Instagram handle. */
function cleanInstagram(value: string): string {
  let s = value.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  s = s.replace(/^instagram\.com\//i, "");
  s = s.replace(/^@/, "");
  s = s.split(/[/?#]/)[0]; // drop trailing slash / query / hash
  return s;
}

export async function fetchBands(): Promise<Band[]> {
  let text: string;
  try {
    const url = `${CSV_URL}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`fetchBands: CSV request failed (${res.status})`);
      return [];
    }
    text = await res.text();
  } catch (err) {
    console.error("fetchBands: failed to fetch CSV", err);
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

  const bands: Band[] = [];

  for (const row of rows.slice(1)) {
    const name = get(row, "NAME");
    if (!name) continue; // skip blank rows

    const slugRaw = get(row, "SLUG");
    // Height for the resolved embed; default to 120 when missing/unparseable.
    const embedHeight = parseInt(get(row, "BANDCAMP EMBED HEIGHT"), 10);

    bands.push({
      name,
      slug: slugRaw || slugify(name),
      genres: get(row, "GENRES")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      city: get(row, "LOCATION"),
      neighborhoods: get(row, "NEIGHBORHOODS")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
      members: get(row, "MEMBERS")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      contactEmail: get(row, "CONTACT_EMAIL"),
      contactMethod: get(row, "CONTACT_METHOD"),
      bio: get(row, "BIO"),
      image: get(row, "IMAGE"),
      website: get(row, "WEBSITE"),
      instagram: cleanInstagram(get(row, "INSTAGRAM")),
      bandcamp: get(row, "BANDCAMP"),
      bandcampEmbedUrl: get(row, "BANDCAMP EMBED URL"),
      bandcampEmbedHeight: Number.isNaN(embedHeight) ? 120 : embedHeight,
      featuredLinks: parseFeaturedLinks(get(row, "FEATURED_LINKS")),
      added: get(row, "ADDED"),
    });
  }

  // Always alphabetical by name (case-insensitive) regardless of sheet row
  // order, so newly added bands slot in rather than landing at the bottom.
  bands.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return bands;
}
