// Backfills the remaining band-profile fields from Birdhaus into the canonical
// Twin Scene `bands` table (Phase 2b). Migration 0011 added the columns; this
// populates them so Twin Scene's own /api/public/bands can fully replace
// Birdhaus as the frontend's source with no regressions.
//
// Fields handled (matched to a Twin Scene row by `slug`):
//   city                  (text)
//   neighborhoods         (jsonb string[])
//   bandcamp_embed_url    (text)  + bandcamp_embed_height (integer)
//   featured_links        (jsonb { url, label, image }[])
//
// NOT touched: instagram/website/bandcamp already live in `socials` (Phase 2),
// and photo was handled by backfill-band-photos.mjs (0010).
//
// Usage:
//   node scripts/migrate/backfill-band-profile-fields.mjs             # dry-run
//   node scripts/migrate/backfill-band-profile-fields.mjs --confirm   # real write
//
// Safety: dry-run by default; a real write needs --confirm AND an interactive
// "yes" on the masked target. Every field change is printed, and any Birdhaus
// band that carries data but has no matching Twin Scene slug is reported rather
// than dropped silently.

import { confirmTarget, connect, die, parseArgs } from "./_safety.mjs";

const BIRDHAUS_API_URL = "https://thebirdhaus.org/api/public/bands";

// The columns this script owns, in a stable order for diff output.
const FIELDS = ["city", "neighborhoods", "bandcamp_embed_url", "bandcamp_embed_height", "featured_links"];

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

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function strArray(v) {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  return out.length ? out : null;
}

function featuredLinks(v) {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((l) => l && typeof l === "object")
    .map((l) => ({ url: str(l.url), label: str(l.label) ?? "", image: str(l.image) ?? "" }))
    .filter((l) => l.url);
  return out.length ? out : null;
}

// The normalized target shape for one Birdhaus band — exactly what the DB row's
// tracked fields should become.
function targetFrom(b) {
  const embedUrl = str(b.bandcampEmbedUrl);
  return {
    city: str(b.city),
    neighborhoods: strArray(b.neighborhoods),
    bandcamp_embed_url: embedUrl,
    // Height is only meaningful alongside a resolved embed; drop it otherwise.
    bandcamp_embed_height: embedUrl && typeof b.bandcampEmbedHeight === "number" ? b.bandcampEmbedHeight : null,
    featured_links: featuredLinks(b.featuredLinks),
  };
}

// Canonical compare so jsonb round-trips (objects/arrays) and scalars compare
// structurally. null and "absent" collapse to the same thing.
const canon = (v) => (v == null ? "null" : JSON.stringify(v));

function main() {
  return run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

async function run() {
  const { confirm } = parseArgs(process.argv);
  const mode = confirm ? "CONFIRM — WILL UPDATE band profile fields" : "DRY-RUN (no writes)";
  const url = await confirmTarget({ scriptName: "backfill-band-profile-fields", mode });
  const sql = connect(url);

  try {
    const birdhaus = await fetchBirdhausBands();
    // Only Birdhaus bands with a slug and at least one populated tracked field
    // carry anything to backfill.
    const incoming = birdhaus
      .map((b) => ({ slug: str(b.slug), target: targetFrom(b) }))
      .filter((b) => b.slug && FIELDS.some((f) => b.target[f] != null));

    const rows = await sql`
      select slug, city, neighborhoods, bandcamp_embed_url, bandcamp_embed_height, featured_links
      from bands
    `;
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const updates = []; // { slug, target, changes: [{field, from, to}] }
    const unmatched = []; // Birdhaus band with data but no Twin Scene slug

    for (const b of incoming) {
      const row = bySlug.get(b.slug);
      if (!row) {
        unmatched.push(b);
        continue;
      }
      const changes = [];
      for (const f of FIELDS) {
        if (canon(row[f]) !== canon(b.target[f])) {
          changes.push({ field: f, from: row[f], to: b.target[f] });
        }
      }
      if (changes.length) updates.push({ slug: b.slug, target: b.target, changes });
    }

    console.log("\n=== SUMMARY ===");
    console.log(`Twin Scene bands:              ${rows.length}`);
    console.log(`Birdhaus bands w/ any field:   ${incoming.length}`);
    console.log(`Rows to update:                ${updates.length}`);
    console.log(`Unmatched (data, no TS slug):  ${unmatched.length}`);
    for (const f of FIELDS) {
      console.log(`  ${f}: ${updates.filter((u) => u.changes.some((c) => c.field === f)).length} changes`);
    }

    if (updates.length) {
      console.log("\n--- WOULD UPDATE ---");
      for (const u of updates) {
        console.log(`  ${u.slug}`);
        for (const c of u.changes) {
          console.log(`      ${c.field}: ${canon(c.from)}  ->  ${canon(c.to)}`);
        }
      }
    }

    if (unmatched.length) {
      console.log("\n--- UNMATCHED (Birdhaus data, NO Twin Scene slug) ---");
      for (const b of unmatched) console.log(`  ${b.slug}: ${canon(b.target)}`);
    }

    if (!confirm) {
      console.log("\nDry-run only. Re-run with --confirm to apply the updates above.");
      return;
    }
    if (!updates.length) {
      console.log("\nNothing to update. Done.");
      return;
    }

    console.log(`\nApplying ${updates.length} row updates...`);
    let applied = 0;
    await sql.begin(async (tx) => {
      for (const u of updates) {
        const t = u.target;
        const res = await tx`
          update bands set
            city                  = ${t.city},
            neighborhoods         = ${t.neighborhoods ? sql.json(t.neighborhoods) : null},
            bandcamp_embed_url    = ${t.bandcamp_embed_url},
            bandcamp_embed_height = ${t.bandcamp_embed_height},
            featured_links        = ${t.featured_links ? sql.json(t.featured_links) : null},
            updated_at            = now()
          where slug = ${u.slug}
        `;
        if (res.count !== 1) die(`Expected to update exactly 1 row for slug ${u.slug}, updated ${res.count} — aborting (transaction rolled back).`);
        applied++;
      }
    });
    console.log(`Updated ${applied} rows.`);
  } finally {
    await sql.end();
  }
}

main();
