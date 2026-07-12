// Raw Postgres client (no ORM) for the Neon-hosted shows database.

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("lib/db: DATABASE_URL is not set");
}

export const sql = postgres(DATABASE_URL);
