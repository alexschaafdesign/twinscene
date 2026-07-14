// Shared safety rails for the Phase 2 band-migration scripts (Twin Scene side).
//
// Non-negotiables these helpers enforce:
//   - Every script prints which DB host it's connected to (masked) and makes
//     the operator confirm it's the right target before doing anything.
//   - Write-capable scripts default to dry-run; a real write requires --confirm.
//   - Anything unexpected calls die() to stop loudly rather than continue.

import path from "node:path";
import readline from "node:readline";
import postgres from "postgres";

export function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (name) => args.includes(name);
  const value = (name) => {
    const hit = args.find((a) => a.startsWith(`${name}=`));
    return hit ? hit.slice(name.length + 1) : null;
  };
  return {
    confirm: flag("--confirm"),
    allowUnmapped: flag("--allow-unmapped"),
    file: value("--file"),
    args,
  };
}

// Masks a connection string down to a recognizable-but-safe tail: the last 6
// chars of host:port. Enough to tell prod from a mistake, not enough to leak.
export function maskTarget(url) {
  try {
    return "***" + new URL(url).host.slice(-6);
  } catch {
    return "***" + String(url).slice(-6);
  }
}

function loadEnv() {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  } catch {
    // fall back to the ambient environment
  }
  const url = process.env.DATABASE_URL;
  if (!url) die("DATABASE_URL is not set (expected in .env.local).");
  return url;
}

async function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(question, resolve));
  } finally {
    rl.close();
  }
}

// Loads env, prints the (masked) target, and blocks on an explicit "yes" from
// the operator. Reading from a closed / non-interactive stdin yields "" → abort,
// so nothing can run unconfirmed by accident. Returns the resolved URL.
export async function confirmTarget({ scriptName, mode }) {
  const url = loadEnv();
  console.log(`\n=== ${scriptName} ===`);
  console.log(`Mode:   ${mode}`);
  console.log(`Target: ${maskTarget(url)}  (Twin Scene / DATABASE_URL)`);
  const answer = (await promptLine("\nType 'yes' to confirm this is the correct target: "))
    .trim()
    .toLowerCase();
  if (answer !== "yes" && answer !== "y") {
    die("Target not confirmed — aborting. Nothing was changed.");
  }
  return url;
}

export function connect(url) {
  // Mirrors lib/db.ts: the Neon pooled URL carries its own sslmode.
  return postgres(url);
}
