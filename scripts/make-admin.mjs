// Grants (or revokes) is_admin on a users row by email. The user row must
// already exist — sign in once via the magic-link flow first so the upsert
// in lib/auth.ts (consumeLoginToken) has created it.
//
// Usage:
//   node scripts/make-admin.mjs <email>            # grant is_admin
//   node scripts/make-admin.mjs <email> --revoke    # revoke is_admin

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // No .env.local — fall back to whatever is already in the environment.
}

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email> [--revoke]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in .env.local).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
  const [user] = await sql`
    update users set is_admin = ${!revoke} where email = ${email} returning id, email, is_admin
  `;

  if (!user) {
    console.error(`No users row for "${email}".`);
    console.error("Sign in once via /login first, then re-run this script.");
    process.exit(1);
  }

  console.log(`${user.email} (id ${user.id}): is_admin = ${user.is_admin}`);
} finally {
  await sql.end();
}
