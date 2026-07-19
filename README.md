# Twin Scene

Twin Cities band directory and show listings — [twinscene.org](https://twinscene.org).

Next.js 16 (App Router) + React 19 + TypeScript on Vercel, with a Neon Postgres
database queried through raw SQL (`postgres.js`, no ORM) and images on
Cloudflare R2.

> **Note:** this is a *customized* Next.js 16 build. Check
> `node_modules/next/dist/docs/` before relying on framework-coupled behavior —
> APIs and conventions may differ from stock Next.js.

## What's in here

- **Bands** (`/bands`) — the canonical Twin Cities band directory. Twin Scene
  owns this data; sibling projects read it over `/api/public/bands`.
- **Shows** (`/shows`) — venue scrapers plus a daily cron, public submissions,
  and an admin review queue.
- **Musicians** (`/musicians`, `/m/[slug]`) — people as first-class entities,
  linked to the bands they play in.
- **Accounts** — passwordless magic-link login, public profiles at
  `/u/[username]`, following bands, show attendance, an in-app notification
  inbox, statuses, and a site-wide `/feed`.
- **Admin** (`/admin`) — one `is_admin`-gated dashboard: bands, shows, review,
  claims, activity, users.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` (gitignored) supplies `DATABASE_URL` and friends. `.envrc` loads it
via `dotenv_if_exists` so direnv keeps the shell in sync — **it must point at
the Neon dev branch, never prod.**

Local logins print the magic link to the dev console: `RESEND_API_KEY` and
`EMAIL_FROM` live in Vercel Production only.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` / `lint` | The usual Next.js lifecycle. |
| `node scripts/whichdb.mjs` | **Which database am I pointed at?** Run before any write. |
| `node scripts/migrate.mjs` | Apply pending migrations (targets the shell's `DATABASE_URL` = dev by default). |
| `npm run scrape:local` | Run the `localOnly` venue scrapers from a residential IP (needs `npm run dev` in another terminal). |
| `node scripts/make-admin.mjs` | Grant `is_admin`. |
| `node scripts/create-api-client.mjs` | Mint a public-API key. |

## Database

Migrations are additive and sequential in `scripts/migrations/NNNN_*.sql`, and
are applied to prod **before** the code that reads them is deployed.

⚠️ This repo shares its database with Crawlspace, and the same Neon project
hosts prod. Read [`docs/auth-and-db.md`](./docs/auth-and-db.md) before running
any migration or write — it covers the dev/prod isolation setup and the rules
for deliberately targeting prod.

## Docs

- [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) — conventions for
  coding agents; local-only scrapers.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how Twin Scene, Crawlspace, and
  the-birdhaus share data. Read before touching the public bands API, the
  lineup matcher, or the shared DB.
- [`docs/auth-and-db.md`](./docs/auth-and-db.md) — auth model + database
  safety rules. Operational, day-to-day.
- [`docs/architecture.md`](./docs/architecture.md) — the fuller auth/accounts/
  profiles design record, schema, and shipped-status narrative.
- [`perf-baseline.md`](./perf-baseline.md) — measured performance baseline.
</content>
