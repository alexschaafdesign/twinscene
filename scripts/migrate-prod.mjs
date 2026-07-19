// scripts/migrate-prod.mjs — applies pending migrations to PROD. Deliberately
// separate from `node scripts/migrate.mjs`, which always targets dev (it
// loads .env.local, and the shell's DATABASE_URL is dev by convention — see
// docs/auth-and-db.md).
//
// One-time setup: create .env.prod.local in the repo root (gitignored, like
// every .env* file) with a single line:
//
//   DATABASE_URL=<prod Neon connection string>
//
// Get that value from the Vercel dashboard: Project > Settings > Environment
// Variables > Production > DATABASE_URL > reveal. `vercel env pull` won't
// work here — Vercel redacts sensitive vars on pull, so it comes back empty.
//
// Run: node scripts/migrate-prod.mjs   (or npm run migrate:prod)
// Add --yes to skip the confirmation prompt.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_ENV_FILE = join(ROOT, ".env.prod.local");

function readProdUrl() {
  let text;
  try {
    text = readFileSync(PROD_ENV_FILE, "utf8");
  } catch {
    console.error(`\n❌ ${PROD_ENV_FILE} not found.`);
    console.error("\nOne-time setup — create it with a single line:");
    console.error("  DATABASE_URL=<prod Neon connection string>");
    console.error("\nGet the value from the Vercel dashboard (Project > Settings >");
    console.error("Environment Variables > Production > DATABASE_URL > reveal) —");
    console.error("`vercel env pull` redacts sensitive vars, so it won't work here.\n");
    process.exit(1);
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  console.error(`\n❌ No DATABASE_URL line found in ${PROD_ENV_FILE}.\n`);
  process.exit(1);
}

const url = readProdUrl();
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
})();

const sql = postgres(url, { max: 1 });
let dbName, dbUser;
try {
  const [row] = await sql`select current_database() as db, current_user as usr`;
  dbName = row.db;
  dbUser = row.usr;
} catch (err) {
  console.error(`\n❌ Could not connect: ${err.message}\n`);
  process.exit(1);
} finally {
  await sql.end();
}

console.log(`\nTarget: ${host} → database "${dbName}" as "${dbUser}"`);

if (!process.argv.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nThis applies pending migrations to PRODUCTION. Type "yes" to continue: ');
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(1);
  }
}

// Delegate to the real runner in a child process so DATABASE_URL is scoped
// to this one invocation, never touching the parent shell's env (which
// stays pointed at dev per .env.local/.envrc).
const result = spawnSync(process.execPath, [join(ROOT, "scripts", "migrate.mjs")], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
