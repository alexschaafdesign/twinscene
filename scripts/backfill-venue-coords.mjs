// One-time backfill: geocode every venue that has a public address but no
// stored coordinates yet (lat/lng added in migration 0049). Idempotent and
// re-runnable — it only touches rows still missing coords, so a second run
// after fixing a few addresses just fills the stragglers.
//
// Geocoding uses the free US Census onelineaddress endpoint (same service as
// lib/geocode.ts) — no API key, US addresses only. Private-address venues are
// skipped (we never geocode a withheld address).
//
// Targets whatever DATABASE_URL points at — DEV by default (see the DB safety
// notes in docs/auth-and-db.md). To backfill PROD, run migration 0049 there
// first, then:  DATABASE_URL='<prod-url>' node scripts/backfill-venue-coords.mjs
//
// Run: node scripts/backfill-venue-coords.mjs

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local (e.g. CI where DATABASE_URL is already in the environment).
}

const CENSUS_URL =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/** One Census onelineaddress lookup. Returns { lng, lat } or null. */
async function geocodeOne(oneline) {
  if (!oneline?.trim()) return null;
  const url =
    `${CENSUS_URL}?address=${encodeURIComponent(oneline)}` +
    `&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.result?.addressMatches?.[0]?.coordinates;
    if (!coords || typeof coords.x !== "number" || typeof coords.y !== "number") {
      return null;
    }
    return { lng: coords.x, lat: coords.y };
  } catch {
    return null;
  }
}

/** Geocode a venue address. Some rows store a bare street ("204 N 1st St"),
 * others a fully-formed one already carrying city/state/zip. Appending city +
 * state to an already-complete address duplicates them and the Census matcher
 * returns nothing — so try the address AS-IS first, then fall back to appending
 * city/state for the bare-street rows. */
async function geocodeAddress(address, city, state = "MN") {
  if (!address?.trim()) return null;
  return (
    (await geocodeOne(address.trim())) ??
    (await geocodeOne([address.trim(), city?.trim(), state].filter(Boolean).join(", ")))
  );
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function main() {
  const [{ host, current_database }] =
    await sql`select inet_server_addr()::text as host, current_database()`;
  console.log(`DB: ${current_database} @ ${host ?? "(local/socket)"}`);

  const venues = await sql`
    select id, slug, name, address, city
    from venues
    where address is not null
      and address_private = false
      and (lat is null or lng is null)
    order by name
  `;
  console.log(`${venues.length} venue(s) need coordinates.\n`);

  let ok = 0;
  let miss = 0;
  for (const v of venues) {
    const point = await geocodeAddress(v.address, v.city);
    if (!point) {
      console.log(`  ✗ ${v.name} — no match for "${v.address}"`);
      miss++;
      continue;
    }
    await sql`update venues set lat = ${point.lat}, lng = ${point.lng} where id = ${v.id}`;
    console.log(`  ✓ ${v.name} → ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
    ok++;
    // Be gentle with the free Census service.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone. ${ok} geocoded, ${miss} unmatched.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
