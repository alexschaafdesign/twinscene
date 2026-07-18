// Musicians Slice 1 backfill: populates `musicians` + `band_members` (migration
// 0021) from the existing free-text `bands.members` (jsonb array of name
// strings, added in 0014). `bands.members` is read-only here — this script
// never writes to it; it stays as the frozen backup during the transition.
//
// Merge rule: one musician per distinct lower(name) across ALL bands — an
// "Alex" listed in two different bands' member arrays resolves to the same
// musician row, linked to both via band_members. Slugs are generated with the
// same slugify() lib/bands.ts uses, deduped with a numeric suffix on collision
// (mirrors lib/bands.ts's uniqueSlug, scoped to the musicians table instead).
//
// Idempotent: musicians are found by lower(name) before any insert, and
// band_members links use ON CONFLICT DO NOTHING against its (band_id,
// musician_id) primary key — re-running creates zero new musicians and zero
// new links.
//
// Run: node scripts/backfill_musicians.mjs

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local (e.g. CI where DATABASE_URL is already in the environment).
}

// Mirrors lib/bands.ts slugify() exactly, so musician slugs follow the same
// convention as band slugs.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueMusicianSlug(sql, base) {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await sql`select 1 from musicians where slug = ${candidate} limit 1`;
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// Case-insensitive find-or-create, caching within this run so a name repeated
// across many bands only hits the DB once.
async function findOrCreateMusician(sql, name, cache, stats) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const [existing] = await sql`select id from musicians where lower(name) = ${key} limit 1`;
  if (existing) {
    cache.set(key, existing.id);
    stats.musiciansFound++;
    return existing.id;
  }

  const slug = await uniqueMusicianSlug(sql, slugify(name) || "musician");
  const [created] = await sql`
    insert into musicians (name, slug) values (${name}, ${slug}) returning id
  `;
  cache.set(key, created.id);
  stats.musiciansCreated++;
  return created.id;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const bands = await sql`select id, slug, members from bands where members is not null`;

    const stats = { musiciansFound: 0, musiciansCreated: 0, linksCreated: 0 };
    const cache = new Map(); // lower(name) -> musician id, scoped to this run
    let bandsProcessed = 0;

    for (const band of bands) {
      const rawMembers = Array.isArray(band.members) ? band.members : [];
      const names = rawMembers.map((m) => String(m).trim()).filter(Boolean);
      if (names.length === 0) continue;
      bandsProcessed++;

      for (const [index, name] of names.entries()) {
        const musicianId = await findOrCreateMusician(sql, name, cache, stats);
        const result = await sql`
          insert into band_members (band_id, musician_id, position)
          values (${band.id}, ${musicianId}, ${index})
          on conflict (band_id, musician_id) do nothing
        `;
        if (result.count > 0) stats.linksCreated++;
      }
    }

    console.log(`Bands processed (non-empty members): ${bandsProcessed}`);
    console.log(`Distinct musicians found (already existed): ${stats.musiciansFound}`);
    console.log(`Musicians created: ${stats.musiciansCreated}`);
    console.log(`band_members links created: ${stats.linksCreated}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
