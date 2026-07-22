// Pull The Birdhaus's band-tagged live-set videos into Twin Scene's `videos`
// table so they show up on the matching band's profile (alongside the
// UnderCurrentMPLS backfill and hand-entered videos). See
// lib/importBirdhausVideos.ts for the mapping and why this is a pull, not a
// push (ARCHITECTURE.md).
//
// DRY-RUN BY DEFAULT, matching scripts/undercurrent-backfill.ts and the
// migrate scripts — it always reads and reports, and only writes with
// --confirm (which also blocks on an interactive target confirmation).
//
// Usage (from the Twin Scene repo root; Node >= 23 runs TypeScript directly):
//   node scripts/import-birdhaus-videos.ts            # dry-run: report only
//   node scripts/import-birdhaus-videos.ts --confirm  # write to Twin Scene
//
// Requires both DATABASE_URL (Twin Scene, write target) and
// BIRDHAUS_DATABASE_URL (Birdhaus, read-only source) — the same Birdhaus
// connection the Birdhaus show scraper already uses.

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, maskTarget, confirmTarget } from "./migrate/_safety.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(join(REPO_ROOT, ".env.local"));
} catch {
  // Fall back to the ambient environment (e.g. CI, or a shell with the vars).
}

const { confirm } = parseArgs(process.argv);

if (!process.env.DATABASE_URL) {
  console.error("\n✖ DATABASE_URL is not set (Twin Scene write target).");
  process.exit(1);
}
if (!process.env.BIRDHAUS_DATABASE_URL) {
  console.error("\n✖ BIRDHAUS_DATABASE_URL is not set (Birdhaus read source).");
  process.exit(1);
}

console.log(`\n=== import-birdhaus-videos ===`);
console.log(`Mode:   ${confirm ? "WRITE" : "dry-run (no writes)"}`);
console.log(`Read:   ${maskTarget(process.env.BIRDHAUS_DATABASE_URL)}  (Birdhaus / BIRDHAUS_DATABASE_URL)`);

if (confirm) {
  // Interactive guard on the write target, same as the migrate scripts.
  await confirmTarget({ scriptName: "import-birdhaus-videos", mode: "WRITE" });
} else {
  console.log(`Write:  ${maskTarget(process.env.DATABASE_URL)}  (Twin Scene / DATABASE_URL) — not written in dry-run`);
}

// Dynamic import: lib/db instantiates its postgres client at module load and
// throws if DATABASE_URL is unset, so it must not be imported until after the
// env is loaded and checked above.
const { importBirdhausVideos } = await import("../lib/importBirdhausVideos.ts");

const res = await importBirdhausVideos({ confirm });

console.log(`\nBirdhaus videos tagged to a Twin-Scene-linked band: ${res.candidates}`);
console.log(`  ...whose linked band still exists here (eligible):   ${res.eligible}`);
if (res.danglingBandIds.length > 0) {
  console.log(`  ...skipped (twin_scene_band_id not found in bands): ${res.danglingBandIds.join(", ")}`);
}
if (confirm) {
  console.log(`\nInserted/refreshed ${res.written} 'birdhaus' video row(s).`);
} else {
  console.log(`\nDry run — re-run with --confirm to write these ${res.eligible} row(s) to Twin Scene.`);
}

process.exit(0);
