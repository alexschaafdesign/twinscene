// Backfill Bandcamp genre tags for every band that has a Bandcamp link but no
// band_genres rows yet (source='bandcamp'). Idempotent — reruns upsert
// (band_genres' pk is (band_id, genre_id, source)), so it's safe to run
// again after adding genres to the canonical list or fixing a scraper bug.
//
// Default scope: bands with a Bandcamp URL (socials.bandcampLink and/or
// socials.bandcamp) and zero existing band_genres rows for source='bandcamp'.
// Pass --force to reprocess every band with a Bandcamp URL, even ones
// already scraped (e.g. after a normalization prompt change).
//
// Polite pacing: one band (i.e. up to two Bandcamp page fetches, when a band
// has both link fields) per REQUEST_DELAY_MS, well under 1-2 req/sec.
//
// Run against dev first:
//   node scripts/backfill_bandcamp_genres.mjs
//   node scripts/backfill_bandcamp_genres.mjs --force

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // Fall back to whatever's already in the environment (e.g. CI).
}

// Imported dynamically, after loadEnvFile above — lib/db.ts reads
// DATABASE_URL at module-evaluation time, so a static top-level import would
// run (and throw) before the env file is loaded.
const { sql } = await import("../lib/db.ts");
const { scrapeAndSaveBandGenres } = await import("../lib/bandGenres.ts");
const { isBandcampUrl } = await import("../lib/bandcamp.ts");

const REQUEST_DELAY_MS = 700; // ~1.4 bands/sec, polite for up to 2 fetches/band
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORCE = process.argv.includes("--force");

/** Both stored Bandcamp-ish link fields for a band, filtered to real
 * bandcamp.com URLs (skips pasted <iframe> embed snippets etc). */
function bandcampUrlsFor(row) {
  const socials = row.socials && typeof row.socials === "object" ? row.socials : {};
  const candidates = [socials.bandcampLink, socials.bandcamp].filter(
    (u) => typeof u === "string" && isBandcampUrl(u),
  );
  return Array.from(new Set(candidates.map((u) => u.trim())));
}

async function main() {
  const candidates = await sql`
    select id, slug, name, socials
    from bands
    where socials->>'bandcampLink' is not null or socials->>'bandcamp' is not null
    order by name
  `;

  const withUrls = candidates
    .map((row) => ({ row, urls: bandcampUrlsFor(row) }))
    .filter((x) => x.urls.length > 0);

  let pending = withUrls;
  if (!FORCE) {
    const already = await sql`
      select distinct band_id from band_genres where source = 'bandcamp'
    `;
    const alreadySet = new Set(already.map((r) => String(r.band_id)));
    pending = withUrls.filter((x) => !alreadySet.has(String(x.row.id)));
  }

  console.log(
    `${candidates.length} bands with a Bandcamp link field; ${withUrls.length} with a real bandcamp.com URL; ` +
      `${pending.length} to process${FORCE ? " (--force: reprocessing all)" : " (skipping already-scraped)"}.\n`,
  );
  if (pending.length === 0) {
    console.log("Nothing to backfill.");
    await sql.end();
    return;
  }

  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  let errored = 0;
  let noTags = 0;

  for (const [i, { row, urls }] of pending.entries()) {
    process.stdout.write(`[${i + 1}/${pending.length}] ${row.name} (${row.slug})... `);
    try {
      const result = await scrapeAndSaveBandGenres(row.id, urls);
      if (result.mapped.length === 0) {
        noTags += 1;
        console.log("no tags found");
      } else {
        for (const m of result.mapped) confidenceCounts[m.confidence] += 1;
        console.log(
          `${result.mapped.length} genre${result.mapped.length === 1 ? "" : "s"} mapped` +
            (result.dropped.length > 0 ? `, dropped: ${result.dropped.join(", ")}` : ""),
        );
      }
      for (const followed of result.followedArtistPages) {
        console.log(`    artist page followed: ${followed}`);
      }
    } catch (err) {
      errored += 1;
      console.log(`ERROR — ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("\n--- Summary ---");
  console.log(`Bands processed: ${pending.length}`);
  console.log(`  no tags found: ${noTags}`);
  console.log(`  errored:       ${errored}`);
  console.log(`Genres assigned:`);
  console.log(`  high:   ${confidenceCounts.high}`);
  console.log(`  medium: ${confidenceCounts.medium}`);
  console.log(`  low:    ${confidenceCounts.low}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
