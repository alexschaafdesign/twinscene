// Raw Postgres client (no ORM) for the Neon-hosted shows database.

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("lib/db: DATABASE_URL is not set");
}

// prepare: false — DATABASE_URL points at Neon's pooled (pgbouncer,
// transaction-mode) endpoint, which doesn't reliably support server-side
// prepared statements across pooled backends: a schema change (e.g. an
// ALTER TABLE) can leave some pooled backends holding a stale cached plan for
// an already-prepared query, surfacing as "cached plan must not change
// result type" until that backend happens to recycle.
export const sql = postgres(DATABASE_URL, { prepare: false });
