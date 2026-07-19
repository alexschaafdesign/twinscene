// One-time venues migration — copies the public "Venue" Google Sheet tab into
// Twin Scene's `venues` table (0030_create_venues.sql). Mirrors the shape of
// ../import-bands-to-twinscene.mjs, but the source is a live CSV endpoint
// rather than an exported JSON file, so this fetches it directly instead of
// depending on lib/fetchVenues.ts (which this same migration repoints at
// Postgres — a one-off script shouldn't depend on app code that's mid-change).
//
// DRY-RUN BY DEFAULT. With no flag it fetches, maps, audits, and reports what
// *would* be inserted, then exits without touching the DB. Only `--confirm`
// performs the real insert. Upserts by slug, so it's safe to re-run.
//
// Usage (from the Twin Scene repo root):
//   node scripts/migrate/venues/import-venues.mjs              # dry-run + audit
//   node scripts/migrate/venues/import-venues.mjs --confirm    # real insert

import fs from "node:fs";
import path from "node:path";
import { parseArgs, confirmTarget, connect, die } from "../_safety.mjs";

const { confirm } = parseArgs(process.argv);

const VENUES_CSV_URL =
  "https://docs.google.com/spreadsheets/d/19a_z884uoSZ4KvAOjAFsZaDikRZLHhdRLKBGxkuns90/gviz/tq?tqx=out:csv&gid=547847398&headers=1";

// --- pure helpers, copied from the pre-migration lib/fetchVenues.ts so this
// script has no dependency on app code -------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function parseCapacity(raw) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

// Sheet values are typed in ALL CAPS (e.g. "FIRST AVE"); title-case for
// display, except "DIY" which stays as-is.
function formatType(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.toUpperCase() === "DIY") return "DIY";
  return trimmed
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// --- fetch + parse the sheet ------------------------------------------------

const url = await confirmTarget({
  scriptName: "import-venues",
  mode: confirm ? "CONFIRM — WILL INSERT/UPDATE venues" : "DRY-RUN (no writes)",
});

console.log(`\nFetching ${VENUES_CSV_URL}`);
const res = await fetch(`${VENUES_CSV_URL}&t=${Date.now()}`, { cache: "no-store" });
if (!res.ok) die(`CSV request failed (${res.status})`);
const csvText = await res.text();

const rows = parseCSV(csvText);
if (rows.length < 2) die("CSV had no data rows — refusing to proceed.");

const header = rows[0].map((h) => h.trim().toUpperCase());
const col = {};
header.forEach((name, idx) => {
  if (name) col[name] = idx;
});
const get = (row, name) => {
  const idx = col[name];
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
};

const seenSlugs = new Set();
const mapped = [];
for (const row of rows.slice(1)) {
  const name = get(row, "NAME");
  if (!name) continue; // skip blank rows

  const slugRaw = get(row, "SLUG");
  const slug = slugRaw || slugify(name);
  if (seenSlugs.has(slug)) {
    die(`duplicate slug "${slug}" (name="${name}") in the sheet — aborting (no silent drops).`);
  }
  seenSlugs.add(slug);

  mapped.push({
    slug,
    name,
    city: get(row, "LOCATION") || null,
    neighborhood: get(row, "NEIGHBORHOOD") || null,
    capacity: parseCapacity(get(row, "CAPACITY")),
    contact: get(row, "CONTACT") || null,
    notes: get(row, "NOTES") || null,
    parking: get(row, "PARKING") || null,
    accessibility: get(row, "ACCESSIBILITY") || null,
    owner: get(row, "OWNER") || null,
    type: formatType(get(row, "TYPE")) || null,
  });
}

if (mapped.length === 0) die("mapped 0 venues from the sheet — refusing to proceed.");

const previewPath = path.join(process.cwd(), "venues-import-preview.json");
fs.writeFileSync(previewPath, JSON.stringify(mapped, null, 2) + "\n");

console.log("\n================ AUDIT ================");
console.log(`Sheet data rows:     ${rows.length - 1}`);
console.log(`Mapped venues:       ${mapped.length}`);
console.log(`With capacity:       ${mapped.filter((m) => m.capacity != null).length}`);
console.log(`With type:           ${mapped.filter((m) => m.type).length}`);
console.log(`Full mapped set →    ${previewPath}`);
console.log("\n-- first 5 mapped --");
mapped.slice(0, 5).forEach((m, i) => console.log(`   [${i + 1}] slug=${m.slug} name=${JSON.stringify(m.name)} city=${JSON.stringify(m.city)} type=${JSON.stringify(m.type)}`));
console.log("======================================");

const sql = connect(url);
try {
  const [{ n: existing }] = await sql`select count(*)::int as n from venues`;
  console.log(`\nExisting Twin Scene venues: ${existing}`);

  if (!confirm) {
    console.log("\nDRY-RUN complete. No rows were written.");
    console.log("Audit the report above (and venues-import-preview.json), then re-run with --confirm.");
  } else {
    if (existing > 0) {
      die(`Twin Scene venues already has ${existing} rows — refusing to import onto a non-empty table.\n  This is meant to seed an empty table; investigate before proceeding.`);
    }

    const inserted = await sql.begin(async (tx) => {
      const out = [];
      for (const m of mapped) {
        const [ins] = await tx`
          insert into venues (
            slug, name, city, neighborhood, capacity, contact, notes, parking,
            accessibility, owner, type
          ) values (
            ${m.slug}, ${m.name}, ${m.city}, ${m.neighborhood}, ${m.capacity},
            ${m.contact}, ${m.notes}, ${m.parking}, ${m.accessibility}, ${m.owner}, ${m.type}
          )
          returning id
        `;
        out.push(ins.id);
      }
      return out;
    });

    const [{ n: after }] = await sql`select count(*)::int as n from venues`;
    if (after !== mapped.length) {
      die(`post-insert count is ${after}, expected ${mapped.length} — aborting.`);
    }
    console.log(`\nInserted ${inserted.length} venues.`);
  }
} finally {
  await sql.end();
}
