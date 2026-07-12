// One-time backfill: import every row from the Shows sheet into the new
// Postgres `shows` table. Read-only against the sheet; only writes to
// Postgres. Safe to re-run — upserts on source_key.
//
// Excluded: sheet row with VENUE "TESTY TEST" (ID 1e1a5974-77e5-45ca-905b-
//2f920887491e) — a test submission through the public show form, not a
// real show.
//
// Empty SOURCE_KEY handling: the one remaining empty-key row (the legacy
// "Yellow Ostrich" row, blank SOURCE, predates the SOURCE/SOURCE_KEY columns
// being populated on manual adds) gets source = "manual" and
// source_key = "manual:<sheet ID>", reusing the sheet's existing stable ID
// since it's already unique per row.
//
// lineup: split LINEUP on commas into { name, bandSlug: null } entries.
// bandSlug resolution against the Birdhaus directory is a separate
// follow-up phase — every entry gets bandSlug: null here, regardless of
// what BAND_SLUGS already has resolved.
//
// edited_at: for rows with a non-empty EDITED cell, set to the time this
// script runs (not a reconstruction of the historical EDITED date).
//
// Run: node scripts/backfill-shows.mjs

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local (e.g. CI where DATABASE_URL is already in the environment).
}

const SHOWS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=1656115359&headers=1";

const EXCLUDED_IDS = new Set(["1e1a5974-77e5-45ca-905b-2f920887491e"]);

/** Kept in sync with the parser in lib/fetchShows.ts / lib/fetchBands.ts. */
function parseCSV(text) {
  const rows = [];
  let row = [];
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
      i++;
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

async function fetchSheetRows() {
  const res = await fetch(`${SHOWS_CSV_URL}&t=${Date.now()}`);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = {};
  header.forEach((name, idx) => {
    if (name) col[name] = idx;
  });
  const get = (row, name) => (row[col[name]] ?? "").trim();

  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "")
    .map((row) => {
      const raw = {};
      for (const name of header) raw[name] = get(row, name);
      return raw;
    });
}

function toLineup(raw) {
  const source = raw.LINEUP || raw.TITLE;
  const names = source
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return [];
  return names.map((name) => ({ name, bandSlug: null }));
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  const runTimestamp = new Date();

  try {
    const allRows = await fetchSheetRows();
    const rows = allRows.filter((r) => !EXCLUDED_IDS.has(r.ID));
    console.log(`Fetched ${allRows.length} sheet rows, ${rows.length} after exclusions.`);

    let inserted = 0;
    for (const raw of rows) {
      const source = raw.SOURCE || "manual";
      const sourceKey = raw.SOURCE_KEY || `manual:${raw.ID}`;

      await sql`
        INSERT INTO shows (
          source, source_key, venue_name, title, date, time, ticket_url,
          lineup, starred, edited_at, raw
        ) VALUES (
          ${source}, ${sourceKey}, ${raw.VENUE}, ${raw.TITLE}, ${raw.DATE}, ${null}, ${raw.LINK || null},
          ${sql.json(toLineup(raw))}, ${!!raw.STARRED_BY}, ${raw.EDITED ? runTimestamp : null}, ${sql.json(raw)}
        )
        ON CONFLICT (source_key) DO UPDATE SET
          source = EXCLUDED.source,
          venue_name = EXCLUDED.venue_name,
          title = EXCLUDED.title,
          date = EXCLUDED.date,
          ticket_url = EXCLUDED.ticket_url,
          lineup = EXCLUDED.lineup,
          starred = EXCLUDED.starred,
          edited_at = EXCLUDED.edited_at,
          raw = EXCLUDED.raw,
          updated_at = now()
      `;
      inserted++;
    }

    console.log(`Upserted ${inserted} rows into shows.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
