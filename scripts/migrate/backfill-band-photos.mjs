// Backfills band photos from Birdhaus into the canonical Twin Scene `bands`
// table. Phase 2 moved the band records over but not their photos; migration
// 0010 added the `photo` column, and this script populates it.
//
// Source of truth for photos is still Birdhaus's public API. Each band is
// matched to a Twin Scene row by `slug` (identical on both sides — Twin Scene's
// slugs were imported from Birdhaus). Photos are full absolute URLs on
// Birdhaus's image host, stored verbatim.
//
// Usage:
//   node scripts/migrate/backfill-band-photos.mjs             # dry-run (no writes)
//   node scripts/migrate/backfill-band-photos.mjs --confirm   # real UPDATE
//
// Safety: dry-run by default; a real write needs --confirm AND an interactive
// "yes" on the masked target. Nothing is skipped silently — every Birdhaus
// photo whose slug has no Twin Scene match is printed, not dropped.

import { confirmTarget, connect, die, parseArgs } from "./_safety.mjs";

const BIRDHAUS_API_URL = "https://thebirdhaus.org/api/public/bands";

async function fetchBirdhausBands() {
  const apiKey = process.env.BIRDHAUS_API_KEY;
  if (!apiKey) die("BIRDHAUS_API_KEY is not set (expected in .env.local).");

  const res = await fetch(BIRDHAUS_API_URL, { headers: { "x-api-key": apiKey } });
  if (!res.ok) die(`Birdhaus request failed (${res.status}).`);

  const body = await res.json();
  const list = Array.isArray(body) ? body : Array.isArray(body?.bands) ? body.bands : null;
  if (!Array.isArray(list)) die("Birdhaus returned an unexpected response shape.");
  return list;
}

async function main() {
  const { confirm } = parseArgs(process.argv);
  const mode = confirm ? "CONFIRM — WILL UPDATE bands.photo" : "DRY-RUN (no writes)";
  const url = await confirmTarget({ scriptName: "backfill-band-photos", mode });
  const sql = connect(url);

  try {
    // Birdhaus bands that actually carry a photo — those are the only ones with
    // anything to backfill. Records missing slug/photo contribute nothing.
    const birdhaus = await fetchBirdhausBands();
    const withPhoto = birdhaus
      .map((b) => ({ slug: typeof b.slug === "string" ? b.slug : "", photo: typeof b.photo === "string" ? b.photo : "" }))
      .filter((b) => b.slug && b.photo);

    // Current Twin Scene rows, keyed by slug.
    const rows = await sql`select slug, photo from bands`;
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const toUpdate = []; // slug present on both sides, photo differs → will write
    const unchanged = []; // already has the same photo
    const unmatched = []; // Birdhaus photo whose slug has no Twin Scene row

    for (const b of withPhoto) {
      const row = bySlug.get(b.slug);
      if (!row) {
        unmatched.push(b);
      } else if (row.photo === b.photo) {
        unchanged.push(b);
      } else {
        toUpdate.push(b);
      }
    }

    // Twin Scene rows that will still have no photo after this run.
    const stillMissing = rows.filter((r) => {
      if (r.photo) return false;
      const src = withPhoto.find((b) => b.slug === r.slug);
      return !src; // no incoming photo for this slug
    });

    console.log("\n=== SUMMARY ===");
    console.log(`Twin Scene bands:            ${rows.length}`);
    console.log(`Birdhaus bands w/ photo:     ${withPhoto.length}`);
    console.log(`Will update (photo differs): ${toUpdate.length}`);
    console.log(`Already up to date:          ${unchanged.length}`);
    console.log(`Unmatched Birdhaus photos:   ${unmatched.length}  (slug not in Twin Scene)`);
    console.log(`Twin Scene rows still w/o photo after run: ${stillMissing.length}`);

    if (toUpdate.length) {
      console.log("\n--- WOULD UPDATE ---");
      for (const b of toUpdate) console.log(`  ${b.slug}  ->  ${b.photo}`);
    }

    // Never drop an unmatched photo silently — print every one so a slug drift
    // between Birdhaus and Twin Scene is visible and can be reconciled.
    if (unmatched.length) {
      console.log("\n--- UNMATCHED (Birdhaus photo, NO Twin Scene slug) ---");
      for (const b of unmatched) console.log(`  ${b.slug}  ->  ${b.photo}`);
    }

    if (stillMissing.length) {
      console.log("\n--- TWIN SCENE ROWS THAT STAY PHOTOLESS ---");
      for (const r of stillMissing) console.log(`  ${r.slug}`);
    }

    if (!confirm) {
      console.log("\nDry-run only. Re-run with --confirm to apply the updates above.");
      return;
    }

    if (!toUpdate.length) {
      console.log("\nNothing to update. Done.");
      return;
    }

    console.log(`\nApplying ${toUpdate.length} updates...`);
    let applied = 0;
    await sql.begin(async (tx) => {
      for (const b of toUpdate) {
        const res = await tx`update bands set photo = ${b.photo}, updated_at = now() where slug = ${b.slug}`;
        if (res.count !== 1) die(`Expected to update exactly 1 row for slug ${b.slug}, updated ${res.count} — aborting (transaction rolled back).`);
        applied++;
      }
    });
    console.log(`Updated ${applied} band photos.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
