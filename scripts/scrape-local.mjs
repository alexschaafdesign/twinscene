// Run the venue scrapers that can't run on Vercel — their sites (e.g. behind
// Cloudflare) 403 requests from datacenter IPs, but accept them from a
// residential IP. This hits your LOCAL dev server, so the venue fetch goes out
// from your home network; auto-import then writes to the same shared Postgres
// DB prod reads from, so the shows show up in production. Idempotent (upserts
// by source_key), so it's safe to re-run and safe alongside the Vercel cron.
//
// Usage:
//   1. npm run dev        (in another terminal — the scrape runs there)
//   2. npm run scrape:local
//
// Env (from .env.local): SCRAPE_SECRET (required). Optional SCRAPE_BASE_URL to
// point at a non-default dev origin (defaults to http://localhost:3000). Note:
// it MUST be your local server — pointing at the prod URL would run the fetch
// on Vercel again and hit the same 403.

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
} catch {
  // Fall back to whatever's already in the environment.
}

// Venue ids marked `localOnly: true` in lib/scrapers/index.ts. Keep in sync
// with that registry (there's no cross-import since this is a plain .mjs).
const LOCAL_ONLY = ["hookandladder"];

const BASE_URL = (process.env.SCRAPE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.SCRAPE_SECRET || "";

async function main() {
  if (BASE_URL.includes("twinscene.org") || !/localhost|127\.0\.0\.1/.test(BASE_URL)) {
    console.warn(
      `⚠  SCRAPE_BASE_URL is ${BASE_URL} — this must be your LOCAL dev server, ` +
        `or the scrape runs on Vercel and hits the same 403.`,
    );
  }

  for (const id of LOCAL_ONLY) {
    const url = `${BASE_URL}/api/scrape/${id}?secret=${encodeURIComponent(SECRET)}`;
    process.stdout.write(`Scraping ${id}… `);
    try {
      const res = await fetch(url);
      const body = await res.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        // Not JSON — a non-API response (wrong port, a Next error page, etc.).
        console.log(`FAILED (${res.status}): non-JSON response from ${BASE_URL}`);
        console.log(`   → is a dev server (with the shows routes) running there? Start it with \`npm run dev\`.`);
        continue;
      }
      if (!res.ok) {
        console.log(`FAILED (${res.status}): ${data.error ?? "unknown error"}`);
        continue;
      }
      const v = data.scrapers?.[0];
      if (v?.error) {
        console.log(`FAILED: ${v.error}`);
      } else if (v) {
        console.log(`ok — ${v.total} scraped, ${v.autoImported} imported, ${v.queued} queued`);
      } else {
        console.log("ok");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      if (/fetch failed|ECONNREFUSED/.test(msg)) {
        console.log("   → is the dev server running? Start it with `npm run dev`.");
      }
    }
  }
}

main();
