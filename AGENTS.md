<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cross-project architecture

This repo is one of three sibling projects (twinscene, the-birdhaus, crawlspace)
that share band and show data — Twin Scene owns the canonical `bands` table and
the shared `shows` table both it and Crawlspace read/write. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) before touching anything that crosses
those boundaries (the public bands API, the lineup matcher, the shared DB).

# Local-only scrapers

Some venue sites (e.g. The Hook and Ladder, behind Cloudflare) return 403 to
requests from datacenter IPs, so they can't be scraped from Vercel — but they
accept requests from a residential IP. Those scrapers are flagged `localOnly: true`
in `lib/scrapers/index.ts`:

- The Vercel daily cron runs `getCronScrapers()` (everything except `localOnly`),
  so it never 403s on them.
- Run the `localOnly` venues from a residential network with `npm run scrape:local`
  (needs `npm run dev` running in another terminal — the scrape executes there).
  Because shows live in one shared Postgres DB, a local run populates production;
  imports upsert by `source_key`, so it's idempotent and safe alongside the cron.
- On-demand endpoints (`/api/scrape/<id>`, `/api/scrape/all`) still run any venue
  when asked, so hitting them locally works for `localOnly` venues too.
