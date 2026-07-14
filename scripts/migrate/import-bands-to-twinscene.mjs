// Phase 2, step 2 — map Birdhaus's exported bands into Twin Scene's bands table.
//
// DRY-RUN BY DEFAULT. With no flag it maps, audits, and reports what *would* be
// inserted, then exits without touching the DB. Only `--confirm` performs the
// real insert.
//
// Usage (from the Twin Scene repo root, with bands-export.json copied in):
//   node scripts/migrate/import-bands-to-twinscene.mjs              # dry-run + audit
//   node scripts/migrate/import-bands-to-twinscene.mjs --confirm    # real insert
//   node scripts/migrate/import-bands-to-twinscene.mjs --file=/abs/path/bands-export.json
//
// On --confirm it writes bands-id-mapping.json ({ birdhaus_id, twin_scene_id,
// slug } per row) for the Birdhaus backfill step (step 5). Dry-run also writes
// bands-import-preview.json with every mapped row, so the audit (step 3) can
// inspect all 344, not just the samples printed here.

import fs from "node:fs";
import path from "node:path";
import { parseArgs, confirmTarget, connect, die } from "./_safety.mjs";

const { confirm, file } = parseArgs(process.argv);

// --- pure mapping helpers -------------------------------------------------

// Mirrors lib/bands.ts slugify() (identical to Birdhaus's), so a reused slug
// and a regenerated one come out in the same shape.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Birdhaus stores genres as a jsonb array; Twin Scene's `genre` is a single
// text column. Collapse to a comma-joined string (lossless-as-text), null when
// there are none.
function genreFrom(genres) {
  if (!Array.isArray(genres)) return null;
  const parts = genres.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim());
  return parts.length ? parts.join(", ") : null;
}

// Twin Scene's `socials` jsonb is built from Birdhaus's separate link columns.
// Only real social/link fields; only non-empty ones; null when none exist.
function socialsFrom(row) {
  const out = {};
  for (const key of ["instagram", "website", "bandcamp"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

// --- load export ----------------------------------------------------------

const url = await confirmTarget({
  scriptName: "import-bands-to-twinscene",
  mode: confirm ? "CONFIRM — WILL INSERT into bands" : "DRY-RUN (no writes)",
});

const exportPath = file ? path.resolve(file) : path.join(process.cwd(), "bands-export.json");
if (!fs.existsSync(exportPath)) {
  die(`export file not found: ${exportPath}\n  Copy bands-export.json from the Birdhaus repo, or pass --file=<path>.`);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(exportPath, "utf8"));
} catch (err) {
  die(`could not parse ${exportPath}: ${err.message}`);
}
if (!Array.isArray(input) || input.length === 0) {
  die(`${exportPath} is empty or not a JSON array — refusing to proceed.`);
}
console.log(`\nLoaded ${input.length} rows from ${exportPath}`);

const sql = connect(url);

try {
  const [{ n: existing }] = await sql`select count(*)::int as n from bands`;
  console.log(`Existing Twin Scene bands: ${existing}`);

  const existingSlugs = new Set((await sql`select slug from bands`).map((r) => r.slug));

  // --- map every row, tracking slug collisions and name anomalies ---------
  const used = new Set(existingSlugs);
  const seenNamesLower = new Map(); // lower(name) -> first birdhaus_id
  const mapped = [];
  const collisions = [];
  const duplicateNames = [];

  for (const row of input) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) die(`birdhaus_id=${row.id}: null/empty name — aborting (no silent drops).`);
    if (row.id === undefined || row.id === null) die(`a row is missing its id — aborting.`);

    const lower = name.toLowerCase();
    if (seenNamesLower.has(lower)) {
      duplicateNames.push({ name, birdhaus_ids: [seenNamesLower.get(lower), row.id] });
    } else {
      seenNamesLower.set(lower, row.id);
    }

    // Reuse Birdhaus's slug when it's free in Twin Scene; otherwise generate a
    // unique one from the name (same slugify + numeric suffix as elsewhere).
    let slug = typeof row.slug === "string" && row.slug ? row.slug : slugify(name) || "band";
    if (used.has(slug)) {
      const base = slugify(name) || "band";
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) candidate = `${base}-${suffix++}`;
      collisions.push({ birdhaus_id: row.id, wanted: slug, assigned: candidate });
      slug = candidate;
    }
    used.add(slug);

    mapped.push({
      birdhaus_id: row.id,
      slug,
      name,
      unreviewed: false, // pre-existing bands, not scraper auto-creations
      genre: genreFrom(row.genres),
      socials: socialsFrom(row),
      bio: typeof row.bio === "string" && row.bio.trim() ? row.bio : null,
      hometown: typeof row.hometown === "string" && row.hometown.trim() ? row.hometown : null,
    });
  }

  // Zero-diff invariant: no silent drops between export and mapping.
  if (mapped.length !== input.length) {
    die(`mapped ${mapped.length} rows but export had ${input.length} — silent drop, aborting.`);
  }

  const previewPath = path.join(process.cwd(), "bands-import-preview.json");
  fs.writeFileSync(previewPath, JSON.stringify(mapped, null, 2) + "\n");

  // --- audit report -------------------------------------------------------
  console.log("\n================ AUDIT ================");
  console.log(`Export rows:        ${input.length}`);
  console.log(`Would insert:       ${mapped.length}  (must equal export rows)`);
  console.log(`Slug collisions:    ${collisions.length}`);
  console.log(`Duplicate names:    ${duplicateNames.length} (case-insensitive; not an error, FYI)`);
  console.log(`With genre:         ${mapped.filter((m) => m.genre).length}`);
  console.log(`With socials:       ${mapped.filter((m) => m.socials).length}`);
  console.log(`Full mapped set →   ${previewPath}`);

  if (collisions.length) {
    console.log("\n-- slug collisions (Birdhaus slug already taken; reassigned) --");
    for (const c of collisions) console.log(`   birdhaus_id=${c.birdhaus_id}: ${c.wanted} -> ${c.assigned}`);
  }
  if (duplicateNames.length) {
    console.log("\n-- duplicate names (kept as separate bands; review) --");
    for (const d of duplicateNames) console.log(`   "${d.name}": birdhaus_ids ${d.birdhaus_ids.join(", ")}`);
  }

  const show = (label, m) =>
    console.log(`   [${label}] bh=${m.birdhaus_id} slug=${m.slug} name=${JSON.stringify(m.name)} genre=${JSON.stringify(m.genre)} socials=${JSON.stringify(m.socials)}`);
  console.log("\n-- first 5 mapped --");
  mapped.slice(0, 5).forEach((m, i) => show(`first ${i + 1}`, m));
  console.log("-- last 5 mapped --");
  mapped.slice(-5).forEach((m, i) => show(`last ${i + 1}`, m));
  console.log("======================================");

  if (!confirm) {
    console.log("\nDRY-RUN complete. No rows were written.");
    console.log("Audit the report above (and bands-import-preview.json), then re-run with --confirm.");
  } else {
    // --- real insert (--confirm) ------------------------------------------
    if (existing > 0) {
      die(`Twin Scene bands already has ${existing} rows — refusing to import onto a non-empty table.\n  Phase 2 seeds an empty table; investigate before proceeding.`);
    }

    const mapping = await sql.begin(async (tx) => {
      const out = [];
      for (const m of mapped) {
        const [ins] = await tx`
          insert into bands (slug, name, unreviewed, genre, socials, bio, hometown)
          values (
            ${m.slug}, ${m.name}, ${m.unreviewed}, ${m.genre},
            ${m.socials ? sql.json(m.socials) : null}, ${m.bio}, ${m.hometown}
          )
          returning id
        `;
        out.push({ birdhaus_id: m.birdhaus_id, twin_scene_id: ins.id, slug: m.slug });
      }
      return out;
    });

    const [{ n: after }] = await sql`select count(*)::int as n from bands`;
    if (after !== mapped.length) {
      die(`post-insert count is ${after}, expected ${mapped.length} — aborting before writing mapping file.`);
    }

    const mappingPath = path.join(process.cwd(), "bands-id-mapping.json");
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + "\n");
    console.log(`\nInserted ${mapping.length} bands. Wrote ${mappingPath}`);
    console.log("Next: copy bands-id-mapping.json into the Birdhaus repo root for the backfill step.");
  }
} finally {
  await sql.end();
}
