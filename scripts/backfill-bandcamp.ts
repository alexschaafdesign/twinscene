// One-off backfill for the "Bandcamp Embed URL" column.
//
// Reads the current Index CSV via the app's own data layer (fetchBands), and for
// any band that has a raw Bandcamp URL but no resolved embed URL, runs the shared
// resolver (lib/bandcamp) and reports what would be written.
//
// DRY RUN BY DEFAULT — it never mutates the Google Sheet (the CSV is read-only;
// writes happen through the Apps Script handler). Pass `--write <file.csv>` to
// also emit a slug,embedUrl CSV you can paste/import into the sheet's
// "Bandcamp Embed URL" column.
//
// Pass `--force` to re-resolve EVERY row that has a Bandcamp URL, even if an
// embed is already stored — use this to regenerate embeds saved in an older
// format (e.g. the earlier artwork=small layout).
//
// Run (Node ≥ 23 executes TypeScript directly):
//   node scripts/backfill-bandcamp.ts
//   node scripts/backfill-bandcamp.ts --write bandcamp-embed-backfill.csv
//   node scripts/backfill-bandcamp.ts --force --write bandcamp-embed-backfill.csv

import { writeFileSync } from "node:fs";
import { fetchBands } from "../lib/fetchBands";
import { resolveBandcampEmbedUrl } from "../lib/bandcamp";

/** Quote a CSV field if it contains a comma, quote, or newline. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const writeIdx = args.indexOf("--write");
  const outFile = writeIdx >= 0 ? args[writeIdx + 1] : "";
  if (writeIdx >= 0 && !outFile) {
    console.error("--write requires a file path, e.g. --write backfill.csv");
    process.exit(1);
  }
  // --force re-resolves every row with a Bandcamp URL, even if an embed is
  // already stored — needed to regenerate embeds saved in an older format.
  const force = args.includes("--force");

  const bands = await fetchBands();
  // Default: only rows missing an embed. With --force: every row with a URL.
  const pending = bands.filter((b) =>
    force ? b.bandcamp : b.bandcamp && !b.bandcampEmbedUrl,
  );

  console.log(
    force
      ? `${bands.length} bands total; ${pending.length} with a Bandcamp URL (re-resolving all — --force).\n`
      : `${bands.length} bands total; ${pending.length} with a Bandcamp URL but no embed.\n`,
  );
  if (pending.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const resolved: { slug: string; embedUrl: string; height: number }[] = [];
  let failed = 0;

  for (const band of pending) {
    const { embedUrl, height } = await resolveBandcampEmbedUrl(band.bandcamp);
    if (embedUrl) {
      resolved.push({ slug: band.slug, embedUrl, height });
      console.log(`✓ ${band.name}`);
      console.log(`    ${band.bandcamp}`);
      console.log(`    → ${embedUrl} (height ${height})`);
    } else {
      failed++;
      console.log(`✗ ${band.name} — could not resolve (leaving embed blank)`);
      console.log(`    ${band.bandcamp}`);
    }
    await sleep(300); // be polite to bandcamp.com
  }

  console.log(
    `\n${resolved.length} resolved, ${failed} unresolved, out of ${pending.length}.`,
  );

  if (!outFile) {
    console.log(
      "\nDry run — nothing written. Re-run with `--write <file.csv>` to emit the results.",
    );
    return;
  }

  const csv =
    "SLUG,BANDCAMP EMBED URL,BANDCAMP EMBED HEIGHT\n" +
    resolved
      .map(
        (r) => `${csvField(r.slug)},${csvField(r.embedUrl)},${r.height}`,
      )
      .join("\n") +
    "\n";
  writeFileSync(outFile, csv);
  console.log(`\nWrote ${resolved.length} rows to ${outFile}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
