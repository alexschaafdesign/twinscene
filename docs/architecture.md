Twin Scene — Auth, Accounts & Profiles
Design + status record. Stack: Next.js 16 (App Router, customized build) + React 19 + TS on Vercel; shared Postgres (raw SQL via postgres.js, no ORM; Neon-hosted); Twin Scene owns canonical bands + shared shows; Birdhaus & Crawlspace consume via API; images on Cloudflare R2. Migrations through 0020, all on prod. (Terse operational rules live in CLAUDE.md / docs/auth-and-db.md; this doc is the fuller design + status narrative.)
Status — all shipped to prod unless noted
Auth foundation
* Phase 1 — magic-link login + admin-gated band editing. users, sessions, login_tokens, band_editors (migration 0016). Admin: alex.schaaf@gmail.com (user id 1).
* Phase 2 — band self-editing via band_editors, admin assignment, claim→approve flow (band_claims, migration 0017). Also closed a public-write security hole: app/api/bands/submit (mode:"correct") was unauthenticated (anyone could overwrite any band — root cause of the "58 Belvedere" overwrite); now canEditBand-gated.
* Email: sends via Resend from EMAIL_FROM="Twin Scene <login@thebirdhaus.org>" (Resend free tier = 1 domain, so Twin Scene borrows Birdhaus's verified domain; inbox shows "Twin Scene"). RESEND_API_KEY+EMAIL_FROM in Vercel Production only — local dev logs the link to the console.
Phase 3 — public profiles (the original vision)
* Slice 1 — save-a-band + /profile (migration 0018 created all three collection tables at once: saved_bands, band_follows, show_saves).
* Slice 2 — follow-a-band + show attendance (show_saves.status = 'interested'|'going'|'went'; "I went to this" = 'went'). No migration (0018 covered it).
* Frontend Slice A — auth UX: unified "Sign in / Sign up" passwordless page, account menu (avatar-or-monogram dropdown), logout, and long ~90-day "remember me" sessions so returning users rarely re-auth.
* Frontend Slice B — profile identity: username (case-insensitive unique) + bio on users (migration 0019; name/image_url already existed), profile-edit page, and avatar upload to R2 (reuses the band-photo sharp→WebP pipeline; server-controlled key avatars/<userId>/…, EXIF stripped, size-capped).
* Frontend Slice C — public profiles at /u/[username] (migration 0020: profile_public boolean not null default true). Public by default; per-user private toggle. Public page shows avatar, name, @username, bio, favorite (saved) bands, attended shows, and stats (shows attended all-time + this year). Deliberately never shows email or future/going shows (getUserByUsername selects an explicit column list without email; queries scoped to status='went'). Private + non-owner → minimal avatar/name state; private + owner → full profile with a "only you can see this" note; noindex when private.
Decisions / deferred
* Login method: magic-link only (chose this over passwords — passwords roughly double the auth surface and add reset + rate-limiting flows for the one thing magic links already prove: email ownership). Long sessions solve repeat-login friction. Google sign-in is the likeliest future add if wanted.
* Cross-site "one login" (Twin Scene / Crawlspace / Birdhaus): deferred. Cost hinges on domain structure — subdomains of twinscene.org → a .twinscene.org cookie works with near-zero code; separate domains → a redirect/token SSO flow (strongest argument for Clerk/Auth0). Twin Scene + Crawlspace already share the DB (identity data is shared; only the cookie separates them); Birdhaus has its own DB.
* ⚠️ Secret rotation pending: R2 keys + SCRAPE_SECRET were printed into a chat transcript during a direnv fix (not a git leak). Rotate when convenient; the Vercel OIDC token was self-expiring, ignore.
* Leaderboard (future, "most shows this year"): data already exists — count show_saves where status='went', filtered by year. Respect profile_public (private users excluded). No new schema needed.
* Moderation for public user content: not yet built; worth considering as signups grow.
Core idea: one identity, layered authorization
ONE users table is the single identity; authorization is a SEPARATE layer. users.is_admin → edit ANY band. band_editors(user_id, band_id) → which non-admin users edit which bands. Check, always server-side: canEditBand(user, bandId) = is_admin OR row in band_editors. Never gate on hidden UI. This is why each feature (self-editing, claims, saves, follows, attendance, profiles) snapped on without reworking identity — same users table throughout.
Schema (raw SQL, shared Postgres, owned by Twin Scene)
users        (id bigint pk, email unique, name, username, bio, image_url,
              profile_public boolean not null default true,
              is_admin boolean not null default false, created_at)
              -- unique index on lower(username); email NEVER exposed publicly
band_editors (user_id→users, band_id→bands, role default 'editor', pk(user_id,band_id))
sessions     (id text pk = opaque cookie token, user_id→users, expires_at, created_at)  -- ~90d
login_tokens (token pk = HASH, email, expires_at, created_at)  -- single-use, ~15min
band_claims  (id pk, user_id→users, band_id→bands, status default 'pending',
              created_at, decided_at, decided_by→users)  -- + partial unique idx: 1 pending/user/band
saved_bands  (user_id→users, band_id→bands, created_at, pk(user_id,band_id))   -- "favorites"
band_follows (user_id→users, band_id→bands, created_at, pk(user_id,band_id))
show_saves   (user_id→users, show_id uuid→shows, status, created_at, pk(user_id,show_id))
              -- status 'interested'|'going'|'went'; shows.id is uuid (gen_random_uuid())
Auth mechanism (hand-rolled — chosen over Auth.js/Clerk)
sessions + HTTP-only, Secure, SameSite=Lax cookie holding an opaque token; magic-link login (login_tokens, hashed, single-use). Chosen because it depends only on standard web primitives + your Postgres — won't fight the customized Next 16 build, keeps identity native to the DB. Auth.js couples to Next internals and wants a pg adapter (you use postgres.js); Clerk is the fallback if cross-site login across all three domains becomes a priority.
Database safety (learned the hard way — see docs/auth-and-db.md)
* Neon. Twin Scene + Crawlspace share one DB (dev branch ep-cool-poetry-...); Birdhaus has its own (ep-calm-bonus-...). Prod host ep-small-cell-atttlq50-....
* All three repos: .envrc uses dotenv_if_exists .env.local so direnv watches the file → the shell can't go stale (this was the root cause of the early "everything hit prod" confusion). .env.local points at the DEV branch.
* scripts/migrate.mjs uses process.loadEnvFile, which does NOT override an already-set env var → targets the shell's DATABASE_URL (dev) by default. To hit prod: one-off DATABASE_URL='<prod>' node scripts/migrate.mjs, after printing current_database()+host and confirming it's prod.
* scripts/whichdb.mjs = the standing "am I on prod?" check. Run before any write.
* Additive migrations to prod BEFORE the code deploy. Never test-write prod (use dev branch or a seeded throwaway row). R2 is shared prod storage (not branched) — namespace + clean up test uploads.
Guardrails
* Authorize server-side; a hidden button is not a check.
* Validate login next/redirect params as same-origin relative only (open-redirect guard).
* Public routes: select explicit column lists that exclude email; scope queries so private data (email, future shows) can't leak — verify by reading the SQL, not just the UI.
* Avatars/uploads: re-encode via sharp (strips EXIF), cap size, server-controlled key, images only.
* Username uniqueness enforced by BOTH app check and the unique index (catch the unique-violation race → friendly "taken" error); reserved-word list covers existing + future routes.
* Hash magic-link tokens; single-use, ~15 min.
* Passwords, if ever added: argon2id/bcrypt, never plaintext.
* Customized Next 16 — check node_modules/next/dist/docs/ before relying on framework-coupled behavior.
Deploy playbook (proven across 0016–0020)
1. Confirm dev via whichdb.mjs; commit the intended files only.
2. Apply new migration(s) to prod via the one-off DATABASE_URL='<prod>' prefix; confirm host = prod; sanity-check additive (row counts unchanged).
3. Push to main (Vercel builds prod from main) — after the migration.
4. Verify on the live site.
