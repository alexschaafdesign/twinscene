# Cross-project architecture: Twin Scene, Crawlspace, the Birdhaus

Three sibling Next.js repos, all part of [The Birdhaus](https://thebirdhaus.org)
(Alex's music project):

| Repo | Domain | Role |
|---|---|---|
| **the-birdhaus** | thebirdhaus.org | Alex's main site: house-show listings (markdown-authored, own RSVP system) + an admin dashboard that also keeps a local band directory. |
| **twinscene** (this repo) | twinscene.org / www.twinscene.org | Twin Cities band directory (canonical) + the Shows feature — venue scrapers, daily cron, submit/review admin. |
| **crawlspace** | crawlspace.com | Thin shows-focused companion to Twin Scene — its own front end over the same shows data, no scraping/cron of its own. |

This doc covers how the three share data. Each repo's own `AGENTS.md`/`CLAUDE.md`
covers its internals; this is the map of the boundaries between them.

## Bands: Twin Scene is canonical

Twin Scene's Postgres `bands` table is the single source of truth for band
profile data (bio, photo, genres, socials, featured links, …). This wasn't
always true — bands used to live on Birdhaus, then briefly in a Google Sheet —
but as of the Phase 1 (API) + Phase 2 (data migration) work, Twin Scene owns it.

Twin Scene exposes it at `/api/public/bands` (`GET` list, `GET [slug]`, `POST`
case-insensitive find-or-create), gated by an `x-api-key` header checked against
Twin Scene's own `api_clients` table (`id`, `name`, `can_write`) with a
100-req/min rate limit — see `lib/apiAuth.ts`. `GET` only needs a valid key;
`POST` needs `can_write = true` or it 403s.

**Crawlspace** is a client of this API, not a second writer of band data — it
has no `bands` table of its own:
- Reads it for the show submit/edit form's band picker and to match scraped/typed
  lineup names against the directory (`lib/twinScene.ts`, `getCachedTwinSceneBands`,
  60s TTL cache).
- Writes to it only through the picker's explicit "add new" action, via
  `createTwinSceneBand()` → `POST /api/public/bands`. This is the *only* write
  path — lineup matching itself never creates a band; an unmatched name in a
  lineup just stays unlinked (`bandSlug: null`) until a human deliberately adds
  it. Its Twin Scene API key is write-capable (`can_write = true`).

**the-birdhaus** keeps its own local `bands` table (it has other-project-specific
needs — linking to its own shows/RSVPs, a `visible` flag, etc.) but that table is
now an *overlay* on Twin Scene's canonical directory (migration
`017_bands_overlay.sql`): each row can carry a `twin_scene_band_id` (unique link)
and a `synced_at` timestamp. Enrichment is **pull-based, not push-based**:
- `enrichBandsFromTwinScene()` (`lib/bands.ts`) periodically pulls Twin Scene's
  directory and fills any *currently-empty* field on linked rows — fill-only-if-
  empty, so it never clobbers an edit made directly in Birdhaus's admin.
- A just-in-time single-band sync (`POST /api/admin/bands/twinscene`) runs when
  an operator picks a Twin-Scene-only result in the Edit Show form's typeahead —
  it creates (or updates, on a race) the local overlay row on the spot so the
  show can link to a real `bandId` immediately.
- Birdhaus's own Twin Scene API key is currently read-only in practice (every
  call is a `GET`), though it's provisioned `can_write = true` in Twin Scene's
  `api_clients` table — unused headroom, not a live write path.

### Why pull, not push (history)

Earlier designs had *both* Twin Scene's scraper lineup-matcher and Crawlspace
auto-creating bands in Birdhaus's directory via a write-back endpoint whenever a
scraped show lineup didn't match an existing band. Once scraped-show auto-import
expanded to cover every act (not just confident matches), this flooded Birdhaus
with ~1,450 blank "unreviewed" stub bands within about two days. That batch was
cleaned up (`the-birdhaus/scripts/cleanup-unreviewed-stub-bands.mjs` — already
run; 0 unreviewed bands remain as of this writing) and the write-back paths were
removed:
- Twin Scene's own lineup matcher (`resolveLineupBandSlugs()`,
  `twinscene/lib/shows.ts`) now queries its local canonical table directly — no
  HTTP call, and it was never a writer even before the repoint.
- Crawlspace's lineup matcher (`resolveLineupBandSlugs()`, `crawlspace/lib/shows.ts`)
  is deliberately read-only; only the picker's explicit "add new" writes.

Birdhaus's own legacy `/api/public/bands` (the endpoint the old push-based flow
used) is now **deprecated** — nothing calls it anymore. It's kept live (not
deleted) with a `DEPRECATED` comment and a dated TODO.md entry
(`the-birdhaus/TODO.md`, "Part D") gating its removal until 2026-08-17, to give
a no-traffic window before it's actually deleted.

### Known data-quality gaps

Counts below are a point-in-time snapshot (2026-07-17), not a live figure — re-count
before relying on them.

- Twin Scene: 357 bands, 283 with a photo (74 without; backfill is manual/ongoing).
- Birdhaus's overlay: 353 local bands, 347 linked to a Twin Scene canonical
  record. Six Birdhaus-only bands have no Twin Scene counterpart yet (Beech
  Montana, Bornguesser, Ducksmithson, Headtriiip, Hey Arlo, Megasound) — a
  known, low-priority backfill, not yet scheduled.

## Venues: Twin Scene is canonical

Twin Scene's Postgres `venues` table (`0030_create_venues.sql`) is the single
source of truth for the venue directory (booking notes, capacity, contact,
accessibility, …). This wasn't always true — venues used to live in a public
Google Sheet tab, read live as CSV by both Twin Scene and Crawlspace — but as
of the venues migration (mirroring the bands Phase 1/Phase 2 pattern above),
Twin Scene owns it.

Twin Scene exposes it at `/api/public/venues` (`GET` list, `GET [slug]`),
gated by the same `x-api-key` / `api_clients` mechanism as `/api/public/bands`
(`lib/apiAuth.ts`). Unlike bands, every venue column is public — there's no
restricted field to allowlist away — and there's no `POST`, since nothing
external creates venues (Crawlspace's venue UI is read-only).

**Crawlspace** is a read-only client of this API — it has no `venues` table
of its own and reads it for venue-type filters and matching a show's free-text
venue name to a directory entry (`lib/twinSceneVenues.ts`, mirroring
`lib/twinScene.ts`'s bands client). It reuses the same `TWIN_SCENE_API_KEY` it
already holds for bands — the auth gate is per-client, not per-resource, so no
new API client was needed.

Press directory data is **not** part of this migration — it still lives in
its own Google Sheet tab, read live as CSV by both repos (`lib/fetchPress.ts`
in each), same as venues used to.

## Shows: two unrelated systems that share a name

**Twin Scene + Crawlspace** share one Postgres `shows` table (the same Neon DB,
via `DATABASE_URL` in both repos). Twin Scene's venue scrapers and daily cron
populate it; both apps read from it directly and both accept public submissions
that write to it directly (not through an API) using the same
`insertManualShow` / `editShow` semantics and `show_history` audit logging, so a
submission on either site is indistinguishable from the other. Crawlspace's
press data is separate — read straight from the same public Google Sheet CSV
Twin Scene uses, no DB or API involved. (Venue data used to work the same way;
see "Venues: Twin Scene is canonical" above.)

**the-birdhaus** has its own, entirely independent "shows" concept: house shows
managed through Birdhaus's own admin dashboard, stored in a `shows` table
(joined to `show_bands`/`bands` for the lineup) in Birdhaus's own, physically
separate Neon database, with their own RSVP system (`lib/rsvps.ts`,
`lib/rsvp-email.ts`, admin RSVP summary). (Shows used to be hand-authored
markdown files with frontmatter, `content/shows/*.md`, read via GitHub by
Twin Scene's scraper — that path is gone; the last markdown file was added
2026-07-10, superseded by the admin dashboard.) This has no connection to Twin
Scene/Crawlspace's scraped-show *table* — it's a naming coincidence, not
shared infrastructure, and Birdhaus's shows never land in the shared Postgres
`shows` table. Don't assume a "show" reference in Birdhaus code touches the
Twin Scene/Crawlspace shows table.

Twin Scene's Birdhaus venue scraper (`lib/scrapers/birdhaus.ts`) is the one
exception that *reads* across this boundary: since Birdhaus is Alex's own
venue, it's the one scraper that isn't a flyer/HTML scrape — it connects
directly to Birdhaus's separate Neon DB (`lib/birdhausDb.ts`,
`BIRDHAUS_DATABASE_URL`, a distinct connection from `lib/db.ts`) and queries
`shows`/`show_bands`/`bands` for announced, upcoming shows, same as every
other scraper feeds into the normal scrape → match → import pipeline into the
shared `shows` table. This is a direct DB read rather than a public API (the
pattern bands/venues use) because both repos are Alex's own — no external
client needed. Provisioning `BIRDHAUS_DATABASE_URL` in Twin Scene's Vercel
Production env is required for the daily cron to pick up Birdhaus shows; it's
separate from and in addition to Twin Scene's own `DATABASE_URL`.

## Accounts: Twin-Scene-owned, physically shared with Crawlspace

Twin Scene owns the whole identity/profile layer — `users`, `sessions`,
`login_tokens`, `band_editors`, the claim tables, `musicians`/`band_members`,
`band_follows`/`show_saves`, and `notifications`. Because Crawlspace shares the
same Neon database, those tables are physically visible to it, but they are
**not a shared contract**: Crawlspace neither reads nor writes them, has no
login of its own, and nothing in this layer is exposed over the public API.
Treat it as Twin-Scene-internal — a Crawlspace feature that needs identity is a
design conversation (see "Cross-site one login" in `docs/architecture.md`), not
a query it can just write.

Birdhaus is on a separate database entirely, so it shares none of this.

## Feature flags

Twin Scene's Shows feature (scrapers, `app/shows/**`, the shows admin, plus the
shows bits in the home page/band profiles/`SubmitForm`) was gated behind
`NEXT_PUBLIC_SHOWS_ENABLED` during development. That flag has been fully removed
(2026-07-17) — Shows is unconditionally live in production now.

## Env vars at a glance

| Var | Lives in | Purpose |
|---|---|---|
| `DATABASE_URL` | twinscene, crawlspace | Shared Neon Postgres — `shows`, and (twinscene only) `bands`, `api_clients`, `rate_limits`, plus all the auth/user/profile tables. Birdhaus has its own separate DB. |
| `TWIN_SCENE_API_KEY` / `TWIN_SCENE_API_URL` | crawlspace | Auth for Twin Scene's `/api/public/bands` (read + write, `can_write = true`) and `/api/public/venues` (read-only there; the same key just needs to be valid, not write-capable). |
| `TWIN_SCENE_API_KEY` / `TWIN_SCENE_API_URL` | the-birdhaus | Same endpoint, used read-only in practice (`lib/twinscene.ts`). |
| `SCRAPE_SECRET` | twinscene | Machine token for the show/scrape **API routes**, the daily cron, and `scrape:local`. It is no longer a *page* gate anywhere — the admin dashboard gates on `users.is_admin` (see `docs/auth-and-db.md`); those pages just read the secret server-side and hand it to their client panels so the panels' API calls authenticate. |
| `BIRDHAUS_API_KEY` | *(removed 2026-07-17)* | Used to authenticate Twin Scene's scraper against Birdhaus's now-deprecated `/api/public/bands`; no longer needed once the scraper's lineup matcher was repointed to Twin Scene's own table. |

## See also

- `twinscene/AGENTS.md` — Twin Scene's own conventions (local-only scrapers, etc).
- `the-birdhaus/CLAUDE.md`, `crawlspace/CLAUDE.md` — pointers back to this doc.
- `the-birdhaus/TODO.md` — dated removal entries (legacy JSONB columns, deprecated bands endpoint).
