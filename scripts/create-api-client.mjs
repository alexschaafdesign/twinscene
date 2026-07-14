// Issues an API client key for the public /api/public/* endpoints. Generates a
// random secret, stores only its SHA-256 hash in api_clients, and prints the
// raw key once — after this it is not recoverable from the DB.
//
// Usage:
//   node scripts/create-api-client.mjs <name> [--write]
//
//   node scripts/create-api-client.mjs birdhaus --write   # can_write = true
//   node scripts/create-api-client.mjs crawlspace         # can_write = false

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local — fall back to whatever is already in the environment.
}

const args = process.argv.slice(2);
const canWrite = args.includes("--write");
const name = args.find((a) => !a.startsWith("--"))?.trim();

if (!name) {
  console.error("Usage: node scripts/create-api-client.mjs <name> [--write]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in .env.local).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
  // Guard against accidentally minting a second key for a name that already has
  // an active client — the old key would silently keep working.
  const [existing] = await sql`
    select id from api_clients where name = ${name} and revoked_at is null limit 1
  `;
  if (existing) {
    console.error(
      `An active api_clients row named "${name}" already exists (id ${existing.id}).`,
    );
    console.error("Revoke it first (set revoked_at) if you mean to rotate its key.");
    process.exit(1);
  }

  const rawKey = `ts_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await sql`
    insert into api_clients (name, key_hash, can_write)
    values (${name}, ${keyHash}, ${canWrite})
  `;

  console.log(`Created API client "${name}" (can_write = ${canWrite}).`);
  console.log("");
  console.log(rawKey);
  console.log("");
  console.log("This is the only time the raw key is shown — it is not recoverable afterward.");
} finally {
  await sql.end();
}
