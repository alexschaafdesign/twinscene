// Data layer for the Twin Cities Music Scene directory.
//
// Bands now come from Twin Scene's own canonical `bands` table (lib/bands.ts) —
// the migration from Birdhaus is complete, so the directory reads from the DB
// it owns rather than proxying Birdhaus's public API. (This reads the DB layer
// directly rather than hitting our own /api/public/bands over HTTP: same data,
// same source of truth, no self-request round-trip or API key needed.) Consumers
// all go through fetchBands() below and only ever see the Band shape, so this
// swap didn't require touching any rendering code.
//
// History: this file first read a Google Sheet directly (dead code kept at the
// bottom), then Birdhaus's API, and now Twin Scene's own table.

import { getAllBands, type Band as BandRow } from "./bands";

// A band-curated "linktree" entry: the top things they want people to see
// (show tickets, a new release, etc.). `image` is a best-effort og:image the
// Apps Script pulls from the URL at submission time; blank when none resolved.
export type FeaturedLink = { url: string; label: string; image: string };

export type Band = {
  name: string;
  slug: string;
  genres: string[];
  city: string;
  neighborhoods: string[]; // finer-grained areas within the city; may be empty
  members: string[]; // individual people in the band; may be empty
  contactEmail: string; // public contact address, shown on the profile
  contactMethod: string; // "" | "email" | "instagram" | "website"
  bio: string;
  image: string; // full-resolution photo (profile hero, OG image)
  thumbnailUrl: string; // 400px square variant for grid/list cards; "" when none
  website: string;
  instagram: string; // handle only (normalized from the stored socials URL)
  bandcamp: string; // raw Bandcamp URL the submitter provided
  bandcampEmbedUrl: string; // resolved EmbeddedPlayer URL (blank if unresolved)
  bandcampEmbedHeight: number; // height to render the embed iframe at (px)
  featuredLinks: FeaturedLink[]; // up to 3 band-curated highlight links
  added: string; // not modeled as a distinct field; created_at could back it later
};

/** Reduce a full URL or "@handle" to just the bare Instagram handle. The table
 * stores socials.instagram as a full profile URL, but the profile UI renders
 * "@{handle}" and rebuilds the link as instagram.com/{handle}, so we normalize
 * back to a handle here. Same logic the original sheet-backed reader used. */
function instagramHandle(value: string): string {
  let s = value.trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  s = s.replace(/^instagram\.com\//i, "");
  s = s.replace(/^@/, "");
  s = s.split(/[/?#]/)[0]; // drop trailing slash / query / hash
  return s;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** The `socials` jsonb column: an arbitrary { platform: url } object. Only the
 * three link fields the UI reads are pulled out. */
function socialsOf(v: unknown): { instagram: string; website: string; bandcamp: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { instagram: asString(o.instagram), website: asString(o.website), bandcamp: asString(o.bandcamp) };
}

/** The `featured_links` jsonb column: a { url, label, image }[] array. */
function featuredLinksOf(v: unknown): FeaturedLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({ url: asString(l.url), label: asString(l.label), image: asString(l.image) }))
    .filter((l) => l.url);
}

/** Map a canonical `bands` row onto this app's Band shape. `unreviewed` and
 * `hometown` exist on the row but aren't surfaced in any Band consumer yet —
 * carry them over if/when the UI grows a use for them. */
function fromTwinScene(b: BandRow): Band {
  const socials = socialsOf(b.socials);
  return {
    name: b.name,
    slug: b.slug,
    genres: (b.genre ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
    city: b.city ?? "",
    neighborhoods: asStringArray(b.neighborhoods),
    members: asStringArray(b.members),
    contactEmail: b.contact_email ?? "",
    contactMethod: b.contact_method ?? "",
    bio: b.bio ?? "",
    image: b.photo ?? "",
    thumbnailUrl: b.thumbnail_url ?? "",
    website: socials.website,
    instagram: instagramHandle(socials.instagram),
    bandcamp: socials.bandcamp,
    bandcampEmbedUrl: b.bandcamp_embed_url ?? "",
    // Default to 120px when the resolved embed carries no height, matching the
    // fallback the sheet-backed and Birdhaus-backed readers both used.
    bandcampEmbedHeight: b.bandcamp_embed_height ?? 120,
    featuredLinks: featuredLinksOf(b.featured_links),
    added: "",
  };
}

export async function fetchBands(): Promise<Band[]> {
  // getAllBands() already orders by name; re-sort case-insensitively to preserve
  // the exact ordering guarantee every earlier backing store made.
  const bands = (await getAllBands()).map(fromTwinScene);
  bands.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return bands;
}

// ---------------------------------------------------------------------------
// Dead code below: the old Google Sheet CSV reader that used to back
// fetchBands() above. Kept present (not deleted) in case the Birdhaus cutover
// surfaces a gap. Remove once the Birdhaus-backed fetchBands() has run in
// production for a while — mirrors the cutover Birdhaus did on their own
// side.
// ---------------------------------------------------------------------------
//
// // Fetches the Google Sheet as CSV and parses it into Band objects.
// // The fetch uses `cache: 'no-store'` (plus a cache-busting timestamp) so the
// // directory always reflects the latest sheet data rather than a cached copy.
// //
// // We read the live "gviz" export (Google Visualization API) rather than the
// // "Publish to web" CSV. Publish-to-web is a separate cached snapshot served
// // from multiple edge caches that refresh on Google's own schedule, so freshly
// // edited/added data (and new columns) would flicker in and out for minutes.
// // gviz reflects the live sheet almost immediately. `headers=1` is required —
// // without it gviz folds the header row into the first data row. `gid=0` is the
// // Index tab; the sheet must be shared "anyone with the link can view".
// const CSV_URL =
//   "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=0&headers=1";
//
// /** Parse the FEATURED_LINKS JSON cell into a validated FeaturedLink[]. */
// function parseFeaturedLinks(raw: string): FeaturedLink[] {
//   if (!raw.trim()) return [];
//   try {
//     const parsed = JSON.parse(raw);
//     if (!Array.isArray(parsed)) return [];
//     return parsed
//       .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
//       .map((l) => ({
//         url: typeof l.url === "string" ? l.url : "",
//         label: typeof l.label === "string" ? l.label : "",
//         image: typeof l.image === "string" ? l.image : "",
//       }))
//       .filter((l) => l.url);
//   } catch {
//     return [];
//   }
// }
//
// /**
//  * Parse CSV text into rows of cells. Handles quoted fields, escaped quotes
//  * (""), and newlines/commas inside quotes — all of which Google Sheets emits.
//  */
// function parseCSV(text: string): string[][] {
//   const rows: string[][] = [];
//   let row: string[] = [];
//   let field = "";
//   let inQuotes = false;
//   let i = 0;
//
//   while (i < text.length) {
//     const char = text[i];
//
//     if (inQuotes) {
//       if (char === '"') {
//         if (text[i + 1] === '"') {
//           field += '"';
//           i += 2;
//           continue;
//         }
//         inQuotes = false;
//         i++;
//         continue;
//       }
//       field += char;
//       i++;
//       continue;
//     }
//
//     if (char === '"') {
//       inQuotes = true;
//       i++;
//     } else if (char === ",") {
//       row.push(field);
//       field = "";
//       i++;
//     } else if (char === "\r") {
//       i++; // ignore — handled by the following \n
//     } else if (char === "\n") {
//       row.push(field);
//       rows.push(row);
//       row = [];
//       field = "";
//       i++;
//     } else {
//       field += char;
//       i++;
//     }
//   }
//
//   // Flush any trailing field/row not terminated by a newline.
//   if (field !== "" || row.length > 0) {
//     row.push(field);
//     rows.push(row);
//   }
//
//   return rows;
// }
//
// /** Lowercase, collapse non-alphanumeric runs into single hyphens, trim hyphens. */
// function slugify(name: string): string {
//   return name
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-+|-+$/g, "");
// }
//
// /** Reduce a full URL or "@handle" to just the bare Instagram handle. */
// function cleanInstagram(value: string): string {
//   let s = value.trim();
//   if (!s) return "";
//   s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
//   s = s.replace(/^instagram\.com\//i, "");
//   s = s.replace(/^@/, "");
//   s = s.split(/[/?#]/)[0]; // drop trailing slash / query / hash
//   return s;
// }
//
// async function fetchBandsFromSheet(): Promise<Band[]> {
//   let text: string;
//   try {
//     const url = `${CSV_URL}&t=${Date.now()}`;
//     const res = await fetch(url, { cache: "no-store" });
//     if (!res.ok) {
//       console.error(`fetchBands: CSV request failed (${res.status})`);
//       return [];
//     }
//     text = await res.text();
//   } catch (err) {
//     console.error("fetchBands: failed to fetch CSV", err);
//     return [];
//   }
//
//   const rows = parseCSV(text);
//   if (rows.length < 2) return [];
//
//   // Map column names (case-insensitive) to their index.
//   const header = rows[0].map((h) => h.trim().toUpperCase());
//   const col: Record<string, number> = {};
//   header.forEach((name, idx) => {
//     if (name) col[name] = idx;
//   });
//
//   const get = (row: string[], name: string): string => {
//     const idx = col[name];
//     if (idx === undefined) return "";
//     return (row[idx] ?? "").trim();
//   };
//
//   const bands: Band[] = [];
//
//   for (const row of rows.slice(1)) {
//     const name = get(row, "NAME");
//     if (!name) continue; // skip blank rows
//
//     const slugRaw = get(row, "SLUG");
//     // Height for the resolved embed; default to 120 when missing/unparseable.
//     const embedHeight = parseInt(get(row, "BANDCAMP EMBED HEIGHT"), 10);
//
//     bands.push({
//       name,
//       slug: slugRaw || slugify(name),
//       genres: get(row, "GENRES")
//         .split(",")
//         .map((g) => g.trim())
//         .filter(Boolean),
//       city: get(row, "LOCATION"),
//       neighborhoods: get(row, "NEIGHBORHOODS")
//         .split(",")
//         .map((n) => n.trim())
//         .filter(Boolean),
//       members: get(row, "MEMBERS")
//         .split(",")
//         .map((m) => m.trim())
//         .filter(Boolean),
//       contactEmail: get(row, "CONTACT_EMAIL"),
//       contactMethod: get(row, "CONTACT_METHOD"),
//       bio: get(row, "BIO"),
//       image: get(row, "IMAGE"),
//       website: get(row, "WEBSITE"),
//       instagram: cleanInstagram(get(row, "INSTAGRAM")),
//       bandcamp: get(row, "BANDCAMP"),
//       bandcampEmbedUrl: get(row, "BANDCAMP EMBED URL"),
//       bandcampEmbedHeight: Number.isNaN(embedHeight) ? 120 : embedHeight,
//       featuredLinks: parseFeaturedLinks(get(row, "FEATURED_LINKS")),
//       added: get(row, "ADDED"),
//     });
//   }
//
//   // Always alphabetical by name (case-insensitive) regardless of sheet row
//   // order, so newly added bands slot in rather than landing at the bottom.
//   bands.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
//
//   return bands;
// }
