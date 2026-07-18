#!/usr/bin/env node
// scripts/whichdb.mjs — prints which database this repo's .env.local points at.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

function fromEnvLocal(key) {
  let text;
  try { text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); }
  catch { return undefined; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return undefined;
}
const hostOf = (u) => { try { return new URL(u).host; } catch { return '(unparseable)'; } };

const fileUrl = fromEnvLocal('DATABASE_URL');
if (!fileUrl) { console.error('❌ No DATABASE_URL in .env.local — run from the repo root.'); process.exit(1); }

const shellUrl = process.env.DATABASE_URL;
if (shellUrl && shellUrl !== fileUrl) {
  console.warn(`\n⚠️  Shell DATABASE_URL host (${hostOf(shellUrl)}) DIFFERS from .env.local (${hostOf(fileUrl)}).`);
  console.warn("   Scripts that don't load .env.local use the SHELL value — check before writing.");
}
console.log(`\n.env.local DATABASE_URL host: ${hostOf(fileUrl)}`);

const sql = postgres(fileUrl, { max: 1 });
try {
  const [row] = await sql`select current_database() as db, current_user as usr`;
  console.log(`connected → database "${row.db}" as user "${row.usr}"`);
  console.log('\n✅ Confirm the host above is your DEV branch, not prod, before any writes.\n');
} catch (err) { console.error(`\n❌ Could not connect: ${err.message}\n`); process.exitCode = 1; }
finally { await sql.end(); }
