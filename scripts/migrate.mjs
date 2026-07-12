// Migration runner: applies hand-written SQL files from scripts/migrations/
// in filename order, tracking what's already run in a `_migrations` table.
//
// Run: node scripts/migrate.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local (e.g. CI where DATABASE_URL is already in the environment).
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    ranAny = true;
    const script = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`Applying ${file}...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(script);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log(`  done.`);
  }

  if (!ranAny) console.log("No pending migrations.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
