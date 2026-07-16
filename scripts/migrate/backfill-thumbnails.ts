// Backfills band-photo thumbnails. Migration 0015 added `bands.thumbnail_url`;
// this script generates one 400px square variant per band photo and populates
// the column. The full-res `photo` is never touched — thumbnails land at a
// separate R2 key (bands/thumb/<slug>.jpg), so this is fully reversible (drop
// the column + delete the thumb/ prefix) with the originals intact.
//
// Source vs. output: the *source* is each band's actual `photo` URL (filenames
// are inconsistent — some <slug>.jpg, some <timestamp>-<hash>.jpg), but the
// *output* is keyed by slug (bands/thumb/<slug>.jpg), the immutable identifier.
//
// Resize + upload go through lib/r2.ts's generateThumbnail/uploadBandThumbnail,
// the same code path the submit route uses for new uploads, so backfilled and
// future thumbnails are byte-identical.
//
// Usage:
//   node scripts/migrate/backfill-thumbnails.ts                 # dry-run (no writes)
//   node scripts/migrate/backfill-thumbnails.ts --limit=5       # dry-run, first 5
//   node scripts/migrate/backfill-thumbnails.ts --confirm       # real: R2 upload + UPDATE
//
// Safety: dry-run by default (downloads + resizes in memory, reports would-be
// sizes, writes nothing). A real run needs --confirm AND an interactive "yes"
// on the masked target. Per-band failures (missing source, decode error, R2
// error) are logged to thumbnail-backfill-failures.log and skipped — one bad
// image never aborts the run.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { confirmTarget, connect, die, parseArgs } from "./_safety.mjs";
// lib/r2.ts is imported dynamically inside main(), after confirmTarget() loads
// .env.local — it reads R2_* env vars at module-eval time, so a static import
// here would capture undefined. Same pattern as undercurrent-backfill.ts.
type R2 = typeof import("../../lib/r2.ts");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FAILURE_LOG = join(SCRIPT_DIR, "thumbnail-backfill-failures.log");
const CONCURRENCY = 8;

type BandRow = { slug: string; photo: string };
type Failure = { slug: string; reason: string };

/** Public origin to serve the thumbnail from, derived from the band's own photo
 * URL (all photos live on images.thebirdhaus.org). Keeps the script independent
 * of R2_PUBLIC_URL, which isn't set in local dev. */
function publicBaseFor(photoUrl: string): string {
  return new URL(photoUrl).origin;
}

async function processBand(
  band: BandRow,
  confirm: boolean,
  sql: ReturnType<typeof connect>,
  r2: R2,
): Promise<{ ok: true; bytes: number } | { ok: false; reason: string }> {
  // Fetch the original.
  let sourceBytes: Uint8Array;
  try {
    const res = await fetch(band.photo);
    if (!res.ok) return { ok: false, reason: `source fetch ${res.status}` };
    sourceBytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    return { ok: false, reason: `source fetch failed: ${(err as Error).message}` };
  }

  // Resize.
  let thumb: Buffer;
  try {
    thumb = await r2.generateThumbnail(sourceBytes);
  } catch (err) {
    return { ok: false, reason: `resize failed: ${(err as Error).message}` };
  }

  // Dry-run stops here — nothing written.
  if (!confirm) return { ok: true, bytes: thumb.length };

  // Upload to R2, then point the column at it.
  try {
    const url = await r2.uploadBandThumbnail(band.slug, thumb, publicBaseFor(band.photo));
    await sql`update bands set thumbnail_url = ${url}, updated_at = now() where slug = ${band.slug}`;
  } catch (err) {
    return { ok: false, reason: `upload/update failed: ${(err as Error).message}` };
  }

  return { ok: true, bytes: thumb.length };
}

async function main() {
  const { confirm, args } = parseArgs(process.argv);
  const limitArg = args.find((a: string) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) : null;

  const mode = confirm
    ? "CONFIRM — WILL upload thumbnails to R2 and UPDATE bands.thumbnail_url"
    : "DRY-RUN (download + resize only, no writes)";
  const url = await confirmTarget({ scriptName: "backfill-thumbnails", mode });
  const sql = connect(url);
  // Dynamic import now that confirmTarget() has loaded .env.local into
  // process.env — lib/r2.ts reads R2_* at module-eval time.
  const r2: R2 = await import("../../lib/r2.ts");

  try {
    const allBands = await sql<BandRow[]>`
      select slug, photo from bands
      where photo is not null and photo <> ''
      order by slug asc
    `;
    const bands: BandRow[] = limit && limit > 0 ? allBands.slice(0, limit) : [...allBands];

    console.log(`\n${bands.length} band(s) with a photo to process (concurrency ${CONCURRENCY}).\n`);

    const failures: Failure[] = [];
    let done = 0;
    let totalBytes = 0;
    let maxBytes = 0;

    // Simple fixed-size worker pool over a shared cursor.
    let cursor = 0;
    async function worker() {
      while (cursor < bands.length) {
        const band = bands[cursor++];
        const result = await processBand(band, confirm, sql, r2);
        done++;
        if (result.ok) {
          totalBytes += result.bytes;
          maxBytes = Math.max(maxBytes, result.bytes);
        } else {
          failures.push({ slug: band.slug, reason: result.reason });
          console.error(`  ✖ ${band.slug}: ${result.reason}`);
        }
        if (done % 25 === 0) console.log(`  …${done}/${bands.length}`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const succeeded = bands.length - failures.length;
    const avgKb = succeeded ? (totalBytes / succeeded / 1024).toFixed(1) : "0";
    const maxKb = (maxBytes / 1024).toFixed(1);

    console.log(`\n=== Summary ===`);
    console.log(`Processed:  ${bands.length}`);
    console.log(`Succeeded:  ${succeeded}  (avg ${avgKb} KB, max ${maxKb} KB per thumbnail)`);
    console.log(`Failed:     ${failures.length}`);
    if (!confirm) console.log(`Mode:       DRY-RUN — nothing was uploaded or written.`);

    if (failures.length) {
      const log = failures.map((f) => `${f.slug}\t${f.reason}`).join("\n") + "\n";
      writeFileSync(FAILURE_LOG, log);
      console.log(`\nFailures written to ${FAILURE_LOG}`);
    }

    // In a real run, verify every photo-bearing band now has a thumbnail.
    if (confirm) {
      const [gap] = await sql<{ n: number }[]>`
        select count(*)::int n from bands
        where photo is not null and photo <> '' and thumbnail_url is null
      `;
      console.log(`\nBands with a photo but no thumbnail_url after run: ${gap.n}`);
      if (gap.n > 0) {
        console.log(`(Re-run — the script is idempotent — or check the failure log above.)`);
      }
    }
  } catch (err) {
    die(`Unexpected error: ${(err as Error).message}`);
  } finally {
    await sql.end();
  }
}

main();
