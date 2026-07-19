// Separate Postgres client for Birdhaus's own Neon database — physically
// distinct from lib/db.ts (Twin Scene/Crawlspace's shared shows DB; see
// ARCHITECTURE.md). Used only by the Birdhaus scraper (lib/scrapers/birdhaus.ts)
// to read Birdhaus's `shows` table directly, since Birdhaus's house shows moved
// from hand-authored markdown to its own admin-dashboard-backed Postgres table.
//
// Lazily created (unlike lib/db.ts) so BIRDHAUS_DATABASE_URL being unset
// doesn't break `next build`'s route collection or any of the other scrapers —
// this is the one scraper with an extra, optional dependency.

import postgres from "postgres";

declare global {
  var __birdhausShowsDb: ReturnType<typeof postgres> | undefined;
}

export function getBirdhausDb(): ReturnType<typeof postgres> {
  if (globalThis.__birdhausShowsDb) return globalThis.__birdhausShowsDb;

  const connectionString = process.env.BIRDHAUS_DATABASE_URL;
  if (!connectionString) {
    throw new Error("lib/birdhausDb: BIRDHAUS_DATABASE_URL is not set");
  }

  // prepare: false — same Neon pooled-endpoint reasoning as lib/db.ts.
  const client = postgres(connectionString, { prepare: false });
  globalThis.__birdhausShowsDb = client;
  return client;
}
